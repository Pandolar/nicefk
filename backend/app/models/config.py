"""Configuration table model."""

from sqlalchemy import Boolean, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.base import Base, TimestampMixin


class ConfigEntry(TimestampMixin, Base):
    """Database-backed configuration entry.

    A flexible config table keeps the MVP schema small while still supporting
    admin settings, payment settings and temporary agent accounts.
    """

    __tablename__ = "fk_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    config_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    config_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_type: Mapped[str] = mapped_column(String(32), default="string", nullable=False)
    group_name: Mapped[str] = mapped_column(String(64), default="system", nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (Index("idx_fk_config_key", "config_key"),)
