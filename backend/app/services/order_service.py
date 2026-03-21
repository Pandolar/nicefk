"""Order and payment business logic."""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.cache import get_cache
from backend.app.core.config import get_settings
from backend.app.core.security import generate_order_no
from backend.app.db.base import now_local
from backend.app.models.goods import Goods
from backend.app.models.order import Order
from backend.app.schemas.order import CreateOrderRequest, OrderRead
from backend.app.services.cdk_service import CdkService
from backend.app.services.config_service import ConfigService
from backend.app.services.email_service import EmailService
from backend.app.services.goods_service import GoodsService
from backend.app.services.payments.epay import EpayService
from backend.app.services.source_service import SourceService


notify_logger = logging.getLogger("nicefk.payments.notify")
reconcile_logger = logging.getLogger("nicefk.reconcile")


class OrderService:
    """Create orders, process payment callbacks and expose query methods."""

    phone_pattern = re.compile(r"^1\d{10}$")
    email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

    def __init__(self, session: Session) -> None:
        self.session = session
        self.cache = get_cache()
        self.settings = get_settings()
        self.config = ConfigService(session)
        self.goods_service = GoodsService(session)
        self.cdk_service = CdkService(session)
        self.email_service = EmailService(session)
        self.epay_service = EpayService(session)
        self.source_service = SourceService(session)

    def _detect_contact_type(self, goods: Goods, contact: str) -> str:
        if self.phone_pattern.match(contact):
            contact_type = "phone"
        elif self.email_pattern.match(contact):
            contact_type = "email"
        else:
            raise ValueError("请输入正确的手机号或邮箱")

        if goods.contact_type == "phone" and contact_type != "phone":
            raise ValueError("该商品仅支持手机号下单")
        if goods.contact_type == "email" and contact_type != "email":
            raise ValueError("该商品仅支持邮箱下单")
        return contact_type

    @staticmethod
    def _normalize_datetime(value):
        """Normalize datetimes loaded from different SQLAlchemy backends."""

        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
        return value

    def _resolve_agent(self, agent_code: str | None, goods_id: int) -> dict[str, Any] | None:
        if not agent_code:
            return None
        for agent in self.config.get_agent_accounts():
            if agent.get("agent_code") != agent_code or int(agent.get("status", 1)) != 1:
                continue
            allowed = agent.get("allowed_goods_ids") or []
            if allowed and goods_id not in allowed:
                raise ValueError("该代理无权推广当前商品")
            return {
                "agent_code": agent_code,
                "agent_name": agent.get("agent_name", agent_code),
                "source_from": "agent_link",
            }
        raise ValueError("代理不存在或已禁用")

    def create_order(self, payload: CreateOrderRequest, client_ip: str) -> tuple[Order, dict[str, Any]]:
        """Create a local pending order and generate ePay form parameters."""

        goods = self.goods_service.get_goods(payload.goods_id, public_only=True)
        contact_type = self._detect_contact_type(goods, payload.buyer_contact)
        normalized_payment_method = self.epay_service.normalize_payment_method(payload.payment_method)
        if goods.pay_methods and normalized_payment_method not in goods.pay_methods:
            raise ValueError("该商品不支持所选支付方式")
        if self.goods_service.available_stock(goods.id) < payload.quantity:
            raise ValueError("当前商品库存不足")

        agent_snapshot = self._resolve_agent(payload.agent_code, goods.id)
        channel_snapshot = None
        if payload.agent_code and payload.channel_code:
            channel_snapshot = self.source_service.validate_channel(payload.agent_code, payload.channel_code)
        order = Order(
            order_no=generate_order_no(),
            goods_id=goods.id,
            buyer_contact=payload.buyer_contact.strip(),
            contact_type=contact_type,
            quantity=payload.quantity,
            amount=goods.price * payload.quantity,
            pay_method=normalized_payment_method,
            status="pending",
            source_raw=payload.source_raw,
        )
        expire_minutes = int(self.config.get("ORDER_EXPIRE_MINUTES", self.settings.order_expire_minutes))
        order.expire_time = now_local().replace(microsecond=0) + timedelta(minutes=expire_minutes)
        if agent_snapshot:
            order.agent_code = agent_snapshot["agent_code"]
            order.agent_name = agent_snapshot["agent_name"]
            order.source_from = agent_snapshot["source_from"]
        source_raw = dict(payload.source_raw or {})
        if channel_snapshot:
            source_raw.update(
                {
                    "channel_code": channel_snapshot["channel_code"],
                    "channel_name": channel_snapshot.get("channel_name"),
                    "promoter_name": channel_snapshot.get("promoter_name"),
                }
            )
        order.source_raw = source_raw or None
        self.session.add(order)
        self.session.commit()
        self.session.refresh(order)

        payment = self.epay_service.build_payment_payload(
            order_no=order.order_no,
            amount=order.amount,
            product_name=goods.title,
            payment_method=normalized_payment_method,
            client_ip=client_ip,
            device=payload.device,
            param="|".join(part for part in [payload.agent_code or "", payload.channel_code or ""] if part),
        )
        self.cache.set(f"pay:pending:{order.order_no}", {"goods_id": goods.id, "quantity": payload.quantity}, ex=expire_minutes * 60)
        if channel_snapshot:
            self.source_service.record_order(order.agent_code, channel_snapshot["channel_code"])
        return order, payment

    def get_order_for_public(self, order_no: str, buyer_contact: str) -> Order:
        order = self.session.scalar(select(Order).where(Order.order_no == order_no, Order.buyer_contact == buyer_contact))
        if not order:
            raise ValueError("订单不存在或联系方式不匹配")
        return order

    def get_order(self, order_no: str) -> Order | None:
        return self.session.scalar(select(Order).where(Order.order_no == order_no))

    def search_public_orders(self, order_no: str | None = None, buyer_contact: str | None = None) -> list[Order]:
        """Search public orders by order number or contact."""

        order_no = (order_no or "").strip()
        buyer_contact = (buyer_contact or "").strip()
        if not order_no and not buyer_contact:
            raise ValueError("请至少填写订单号或手机号/邮箱")

        stmt = select(Order).order_by(Order.id.desc())
        if order_no:
            stmt = stmt.where(Order.order_no == order_no)
        if buyer_contact:
            stmt = stmt.where(Order.buyer_contact == buyer_contact)
        results = list(self.session.scalars(stmt.limit(20)).all())
        if order_no and not results:
            raise ValueError("未查询到相关订单")
        return results

    def build_order_read(self, order: Order) -> OrderRead:
        goods_title = None
        delivery_instructions = None
        try:
            goods = self.goods_service.get_goods(order.goods_id)
            goods_title = goods.title
            delivery_instructions = (goods.delivery_instructions or "").strip() or self.config.get("DELIVERY_DEFAULT_TEMPLATE", "")
        except ValueError:
            goods = None
        item = OrderRead.model_validate(order)
        item.goods_title = goods_title
        item.delivery_instructions = delivery_instructions
        return item

    def list_orders(self, agent_code: str | None = None) -> list[Order]:
        stmt = select(Order).order_by(Order.id.desc())
        if agent_code:
            stmt = stmt.where(Order.agent_code == agent_code)
        return list(self.session.scalars(stmt).all())

    def dashboard_summary(self, agent_code: str | None = None) -> dict[str, Any]:
        filters = []
        if agent_code:
            filters.append(Order.agent_code == agent_code)
        total_orders = self.session.scalar(select(func.count(Order.id)).where(*filters)) or 0
        paid_orders = self.session.scalar(select(func.count(Order.id)).where(*filters, Order.status == "delivered")) or 0
        total_amount = self.session.scalar(select(func.coalesce(func.sum(Order.amount), 0)).where(*filters, Order.status == "delivered")) or 0
        return {
            "total_orders": int(total_orders),
            "paid_orders": int(paid_orders),
            "total_amount": Decimal(str(total_amount)),
        }

    def _acquire_payment_lock(self, order_no: str) -> bool:
        return self.cache.set(f"lock:pay:{order_no}", "1", ex=30, nx=True)

    def process_paid_order(self, order_no: str, trade_no: str | None, callback_payload: dict[str, Any] | None = None) -> Order:
        """Idempotently mark an order as paid and deliver one card."""

        if not self._acquire_payment_lock(order_no):
            order = self.get_order(order_no)
            if not order:
                raise ValueError("订单不存在")
            return order

        try:
            order = self.session.scalar(select(Order).where(Order.order_no == order_no))
            if not order:
                raise ValueError("订单不存在")
            if order.status == "delivered":
                return order

            goods = self.goods_service.get_goods(order.goods_id)
            cards = self.cdk_service.lock_next_available_cards(goods.id, order.quantity)
            if not cards:
                order.status = "failed"
                order.fail_reason = "支付成功但库存不足，请人工处理"
                self.session.add(order)
                self.session.commit()
                raise ValueError(order.fail_reason)

            order.status = "paid"
            order.trade_no = trade_no or order.trade_no
            order.pay_time = now_local()

            deliver_items = []
            for card in cards:
                card.status = "sold"
                card.order_id = order.id
                card.sold_at = now_local()
                deliver_items.append(
                    {
                        "card_code": card.card_code,
                        "card_secret": card.card_secret,
                    }
                )

            first_card = cards[0]
            order.card_id = first_card.id
            order.card_snapshot = {
                "card_code": first_card.card_code,
                "card_secret": first_card.card_secret,
                "items": deliver_items,
                "quantity": order.quantity,
                "callback_payload": callback_payload or {},
            }
            order.commission_rate = None
            order.commission_amount = None
            order.status = "delivered"
            order.deliver_time = now_local()
            order.fail_reason = None
            self.session.add_all([*cards, order])
            self.session.commit()
            self.session.refresh(order)
            notify_logger.info("order_no=%s trade_no=%s delivered=1", order_no, trade_no)
            self.cache.set(f"pay:success:{order_no}", {"status": order.status}, ex=600)
            self.goods_service.clear_public_cache([goods.id])
            self.source_service.record_paid(order.agent_code, order.source_channel_code, order.amount)
            self.email_service.send_order_delivery_email(order, goods)
            return order
        finally:
            self.cache.delete(f"lock:pay:{order_no}")

    def handle_epay_callback(self, payload: dict[str, Any]) -> str:
        """Handle async payment callback.

        The callback result must be the literal `success` or `fail` because ePay
        depends on this value for retry logic.
        """

        notify_logger.info("received payload=%s", payload)
        if not self.epay_service.verify_callback(payload):
            notify_logger.warning("callback signature failed payload=%s", payload)
            return "fail"
        if not self.epay_service.is_paid_callback(payload):
            notify_logger.info("callback not successful payload=%s", payload)
            return "success"
        order = self.get_order(payload.get("out_trade_no", ""))
        if not order:
            notify_logger.warning("callback order missing payload=%s", payload)
            return "fail"
        money = Decimal(str(payload.get("money", "0")))
        if money != Decimal(str(order.amount)):
            notify_logger.warning("callback amount mismatch order_no=%s callback=%s order=%s", order.order_no, money, order.amount)
            return "fail"
        self.process_paid_order(order.order_no, payload.get("trade_no"), payload)
        return "success"

    def reconcile_pending_orders(self) -> dict[str, int]:
        """Query ePay for pending orders and apply payment results.

        Orders older than the configured expiration window are marked as expired if
        the gateway still reports them as unpaid.
        """

        expire_minutes = int(self.config.get("ORDER_EXPIRE_MINUTES", self.settings.order_expire_minutes))
        pending_orders = list(self.session.scalars(select(Order).where(Order.status == "pending")).all())
        checked = paid = expired = 0
        for order in pending_orders:
            checked += 1
            try:
                result = self.epay_service.query_order(order.order_no)
            except Exception as exc:
                reconcile_logger.warning("query failed order_no=%s error=%s", order.order_no, exc)
                continue

            if result.get("code") == 1 and int(result.get("status", 0)) == 1:
                self.process_paid_order(order.order_no, result.get("trade_no"), result)
                paid += 1
                continue

            age_minutes = (now_local() - self._normalize_datetime(order.created_at)).total_seconds() / 60
            if age_minutes >= expire_minutes:
                order.status = "expired"
                order.fail_reason = "订单超时未支付"
                self.session.add(order)
                self.session.commit()
                expired += 1
        reconcile_logger.info("checked=%s paid=%s expired=%s", checked, paid, expired)
        return {"checked": checked, "paid": paid, "expired": expired}

    def reconcile_one_order(self, order_no: str, buyer_contact: str) -> Order:
        """Actively query ePay for one public order when the user confirms payment."""

        order = self.get_order_for_public(order_no, buyer_contact)
        if order.status == "delivered":
            return order
        if order.status not in {"pending", "expired"}:
            return order

        try:
            result = self.epay_service.query_order(order.order_no)
        except Exception as exc:
            reconcile_logger.warning("single query failed order_no=%s error=%s", order.order_no, exc)
            raise ValueError("支付平台查单失败，请稍后再试") from exc

        if result.get("code") == 1 and int(result.get("status", 0)) == 1:
            return self.process_paid_order(order.order_no, result.get("trade_no"), result)

        if order.status == "pending":
            expire_minutes = int(self.config.get("ORDER_EXPIRE_MINUTES", self.settings.order_expire_minutes))
            age_minutes = (now_local() - self._normalize_datetime(order.created_at)).total_seconds() / 60
            if age_minutes >= expire_minutes:
                order.status = "expired"
                order.fail_reason = "订单超时未支付"
                self.session.add(order)
                self.session.commit()
                self.session.refresh(order)
        return order
