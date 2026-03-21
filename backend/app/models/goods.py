"""Goods model."""

from decimal import Decimal

from sqlalchemy import Boolean, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from backend.app.db.base import Base, TimestampMixin


class Goods(TimestampMixin, Base):
    """Goods available in the storefront."""

    __tablename__ = "fk_goods"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    cover: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_fit_mode: Mapped[str] = mapped_column(String(16), default="cover", nullable=False)
    cover_width: Mapped[int | None] = mapped_column(nullable=True)
    cover_height: Mapped[int | None] = mapped_column(nullable=True)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    delivery_instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    original_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="on", nullable=False)
    contact_type: Mapped[str] = mapped_column(String(16), default="both", nullable=False)
    pay_methods: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    stock_display_mode: Mapped[str] = mapped_column(String(16), default="real", nullable=False)
    stock_display_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_subject_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_body_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    __table_args__ = (Index("idx_fk_goods_status_sort", "status", "sort_order"),)
