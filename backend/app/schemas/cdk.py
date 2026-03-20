"""Schema models for CDK management."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CdkImportRequest(BaseModel):
    """Bulk import payload.

    Cards are submitted as multi-line plain text. Each line can be either a single
    card code or `card_code----card_secret`.
    """

    goods_id: int
    cards_text: str


class CdkRead(BaseModel):
    """Admin list payload."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    goods_id: int
    card_code: str
    card_secret: str | None = None
    status: str
    order_id: int | None = None
    locked_at: datetime | None = None
    sold_at: datetime | None = None


class CdkBatchStatusRequest(BaseModel):
    """Bulk freeze/unfreeze payload for admin."""

    ids: list[int] = Field(default_factory=list)
    status: str = Field(..., pattern="^(unused|frozen)$")
