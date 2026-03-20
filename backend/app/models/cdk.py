"""CDK inventory model."""

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.base import Base, TimestampMixin


class CdkCard(TimestampMixin, Base):
    """Card inventory linked to a specific goods item."""

    __tablename__ = "fk_cdk"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    goods_id: Mapped[int] = mapped_column(ForeignKey("fk_goods.id"), nullable=False, index=True)
    card_code: Mapped[str] = mapped_column(Text, nullable=False)
    card_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="unused", nullable=False)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("fk_orders.id"), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    sold_at: Mapped[datetime | None] = mapped_column(nullable=True)

    __table_args__ = (
        Index("idx_fk_cdk_goods_status", "goods_id", "status"),
    )
