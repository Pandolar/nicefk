"""SMTP mail delivery for order completion notifications."""

from __future__ import annotations

import logging
import smtplib
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid
from typing import Any

from sqlalchemy.orm import Session

from backend.app.db.base import now_local
from backend.app.models.goods import Goods
from backend.app.models.order import Order
from backend.app.services.config_service import ConfigService


mail_logger = logging.getLogger("nicefk.mail")


class EmailService:
    """Send delivery emails after successful payment."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.config = ConfigService(session)

    def enabled(self) -> bool:
        return bool(self.config.get("EMAIL_ENABLED", False))

    def _build_template_context(self, order: Order, goods: Goods) -> dict[str, str]:
        snapshot = order.card_snapshot if isinstance(order.card_snapshot, dict) else {}
        items = snapshot.get("items") if isinstance(snapshot.get("items"), list) else []
        if items:
            card_codes = "\n".join(str(item.get("card_code") or "") for item in items if item.get("card_code"))
            card_secrets = "\n".join(str(item.get("card_secret") or "") for item in items if item.get("card_secret"))
        else:
            card_codes = str(snapshot.get("card_code") or "")
            card_secrets = str(snapshot.get("card_secret") or "")
        return {
            "goods_title": goods.title,
            "order_no": order.order_no,
            "buyer_contact": order.buyer_contact,
            "quantity": str(order.quantity),
            "pay_time": order.pay_time.strftime("%Y-%m-%d %H:%M:%S") if order.pay_time else "",
            "deliver_time": order.deliver_time.strftime("%Y-%m-%d %H:%M:%S") if order.deliver_time else "",
            "amount": f"{order.amount:.2f}",
            "card_code": card_codes,
            "card_secret": card_secrets,
            "trade_no": order.trade_no or "",
        }

    @staticmethod
    def render_template(template: str, context: dict[str, str]) -> str:
        result = template or ""
        for key, value in context.items():
            result = result.replace(f"{{{{{key}}}}}", value)
        return result

    def _resolve_templates(self, goods: Goods) -> tuple[str, str]:
        subject_template = goods.email_subject_template or self.config.get("EMAIL_DEFAULT_SUBJECT", "您的订单 {{order_no}} 已自动发货")
        body_template = goods.email_body_template or self.config.get("EMAIL_DEFAULT_TEMPLATE", "")
        return str(subject_template or ""), str(body_template or "")

    def _smtp_config(self) -> dict[str, Any]:
        return {
          "server": self.config.get("SMTP_SERVER", ""),
          "port": int(self.config.get("SMTP_PORT", 465) or 465),
          "user": self.config.get("SMTP_USER", ""),
          "password": self.config.get("SMTP_PASSWORD", ""),
          "from_name": self.config.get("SMTP_FROM", ""),
        }

    def test_connection(self) -> None:
        smtp = self._smtp_config()
        if not smtp["server"] or not smtp["user"] or not smtp["password"]:
            raise ValueError("SMTP 配置不完整")
        server = smtplib.SMTP_SSL(smtp["server"], smtp["port"], timeout=10)
        try:
            server.login(smtp["user"], smtp["password"])
        finally:
            server.quit()

    def send_order_delivery_email(self, order: Order, goods: Goods) -> dict[str, str]:
        if order.contact_type != "email":
            return self._mark_order(order, "skipped", "联系方式不是邮箱")
        if not self.enabled():
            return self._mark_order(order, "skipped", "全局自动发货邮件未启用")
        if not goods.email_enabled:
            return self._mark_order(order, "skipped", "商品未启用自动发货邮件")

        smtp = self._smtp_config()
        if not smtp["server"] or not smtp["user"] or not smtp["password"]:
            return self._mark_order(order, "failed", "SMTP 配置不完整")

        subject_template, body_template = self._resolve_templates(goods)
        context = self._build_template_context(order, goods)
        subject = self.render_template(subject_template, context)
        content = self.render_template(body_template, context)

        msg = MIMEMultipart()
        msg["From"] = formataddr((str(Header(smtp["from_name"] or smtp["user"], "utf-8")), smtp["user"]))
        msg["To"] = order.buyer_contact
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=smtp["user"].split("@")[-1])
        msg["Subject"] = str(Header(subject, "utf-8"))
        msg.attach(MIMEText(content, "html", "utf-8"))

        try:
            server = smtplib.SMTP_SSL(smtp["server"], smtp["port"], timeout=10)
            try:
                server.login(smtp["user"], smtp["password"])
                server.sendmail(smtp["user"], [order.buyer_contact], msg.as_string())
            finally:
                server.quit()
            mail_logger.info("order_no=%s email=%s sent=1", order.order_no, order.buyer_contact)
            return self._mark_order(order, "sent", None)
        except Exception as exc:  # noqa: BLE001
            mail_logger.exception("order_no=%s email=%s send_failed", order.order_no, order.buyer_contact)
            return self._mark_order(order, "failed", str(exc))

    def _mark_order(self, order: Order, status: str, error: str | None) -> dict[str, str]:
        order.email_status = status
        order.email_error = (error or None)[:255] if error else None
        order.email_sent_at = now_local() if status == "sent" else order.email_sent_at
        self.session.add(order)
        self.session.commit()
        return {"status": status, "error": order.email_error or ""}
