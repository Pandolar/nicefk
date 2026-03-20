"""Order model."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from backend.app.db.base import Base, TimestampMixin


class Order(TimestampMixin, Base):
    """Purchase order and payment tracking record."""

    __tablename__ = "fk_orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    trade_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("fk_goods.id"), nullable=False, index=True)
    buyer_contact: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_type: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[int] = mapped_column(default=1, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    pay_method: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    card_id: Mapped[int | None] = mapped_column(ForeignKey("fk_cdk.id"), nullable=True)
    card_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    agent_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    commission_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    source_from: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pay_time: Mapped[datetime | None] = mapped_column(nullable=True)
    deliver_time: Mapped[datetime | None] = mapped_column(nullable=True)
    expire_time: Mapped[datetime | None] = mapped_column(nullable=True)
    fail_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    email_sent_at: Mapped[datetime | None] = mapped_column(nullable=True)
    email_error: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("idx_fk_orders_status_created", "status", "created_at"),
        Index("idx_fk_orders_agent_created", "agent_code", "created_at"),
    )

    @property
    def source_channel_code(self) -> str | None:
        if isinstance(self.source_raw, dict):
            return self.source_raw.get("channel_code")
        return None

    @property
    def source_channel_name(self) -> str | None:
        if isinstance(self.source_raw, dict):
            return self.source_raw.get("channel_name")
        return None
