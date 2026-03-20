"""Schema models for source channel management and analytics."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ChannelBase(BaseModel):
    """Shared source channel fields."""

    agent_code: str = Field(..., min_length=2, max_length=64)
    channel_code: str = Field(..., min_length=2, max_length=64)
    channel_name: str = Field(..., min_length=1, max_length=120)
    promoter_name: str | None = Field(default=None, max_length=120)
    goods_id: int | None = None
    status: int = 1
    note: str | None = Field(default=None, max_length=255)


class ChannelUpsert(ChannelBase):
    """Payload for creating or updating one source channel."""


class ChannelRead(ChannelBase):
    """Channel item with analytics fields."""

    created_at: datetime | None = None
    visit_pv: int = 0
    visit_uv: int = 0
    order_count: int = 0
    paid_count: int = 0
    paid_amount: Decimal = Decimal("0.00")
    promo_link: str | None = None


class ChannelBatchCreateRequest(BaseModel):
    """Bulk channel creation payload.

    Each line supports either:
    - channel_code,channel_name,promoter_name
    - channel_code----channel_name----promoter_name
    """

    agent_code: str = Field(..., min_length=2, max_length=64)
    goods_id: int | None = None
    status: int = 1
    rows_text: str


class ChannelVisitRequest(BaseModel):
    """Public visit tracking payload."""

    agent_code: str
    channel_code: str
    visitor_id: str = Field(..., min_length=6, max_length=128)
