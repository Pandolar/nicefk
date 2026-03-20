"""SQLAlchemy declarative base and common timestamp mixin."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_local() -> datetime:
    """Return the current Shanghai time as timezone-aware datetime."""

    return datetime.now(ZoneInfo("Asia/Shanghai"))


metadata = MetaData()


class Base(DeclarativeBase):
    """Base class shared by all ORM models."""

    metadata = metadata


class TimestampMixin:
    """Reusable created/updated timestamp columns."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_local,
        onupdate=now_local,
        nullable=False,
    )
