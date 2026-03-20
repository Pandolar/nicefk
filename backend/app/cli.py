"""Command line helpers for local initialization and smoke testing."""

from __future__ import annotations

import argparse
from decimal import Decimal

from backend.app.db.base import Base
from backend.app.db.session import SessionLocal, engine
from backend.app.models import CdkCard, ConfigEntry, Goods, Order
from backend.app.models.goods import Goods
from backend.app.schemas.cdk import CdkImportRequest
from backend.app.services.cdk_service import CdkService
from backend.app.services.config_service import ConfigService


def init_db() -> None:
    """Create tables and bootstrap default configuration."""

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        ConfigService(session).ensure_defaults()
    finally:
        session.close()
    print("数据库和默认配置初始化完成")


def seed_demo() -> None:
    """Insert one demo goods item and a few demo cards for quick verification."""

    session = SessionLocal()
    try:
        ConfigService(session).ensure_defaults()
        goods = session.query(Goods).filter(Goods.slug == "demo-goods").first()
        if not goods:
            goods = Goods(
                title="演示商品",
                slug="demo-goods",
                cover="https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
                description="这是一个演示发卡商品，可用于验证支付和自动发卡流程。",
                price=Decimal("19.90"),
                original_price=Decimal("29.90"),
                status="on",
                contact_type="both",
                pay_methods=["alipay", "wxpay"],
                sort_order=100,
            )
            session.add(goods)
            session.commit()
            session.refresh(goods)
        cards_text = "\n".join(["DEMO-CARD-001----PWD001", "DEMO-CARD-002----PWD002", "DEMO-CARD-003----PWD003"])
        CdkService(session).import_cards(CdkImportRequest(goods_id=goods.id, cards_text=cards_text))
    finally:
        session.close()
    print("演示数据写入完成")


def main() -> None:
    parser = argparse.ArgumentParser(description="nicefk CLI")
    parser.add_argument("command", choices=["init-db", "seed-demo"])
    args = parser.parse_args()

    if args.command == "init-db":
        init_db()
    elif args.command == "seed-demo":
        seed_demo()


if __name__ == "__main__":
    main()
