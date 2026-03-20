"""Schema models for goods endpoints."""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class GoodsBase(BaseModel):
    """Common goods fields."""

    title: str = Field(..., max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    cover: str | None = None
    description: str = ""
    price: Decimal
    original_price: Decimal | None = None
    status: str = "on"
    contact_type: str = "both"
    pay_methods: list[str] = Field(default_factory=list)
    stock_display_mode: str = "real"
    stock_display_text: str | None = None
    sort_order: int = 0


class GoodsCreate(GoodsBase):
    """Create payload."""

    email_enabled: bool = False
    email_subject_template: str | None = None
    email_body_template: str | None = None


class GoodsUpdate(BaseModel):
    """Update payload with all fields optional."""

    title: str | None = None
    slug: str | None = None
    cover: str | None = None
    description: str | None = None
    price: Decimal | None = None
    original_price: Decimal | None = None
    status: str | None = None
    contact_type: str | None = None
    pay_methods: list[str] | None = None
    stock_display_mode: str | None = None
    stock_display_text: str | None = None
    email_enabled: bool | None = None
    email_subject_template: str | None = None
    email_body_template: str | None = None
    sort_order: int | None = None


class GoodsRead(GoodsBase):
    """Response payload."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    available_stock: int = 0


class GoodsAdminRead(GoodsRead):
    """Admin payload including delivery email settings."""

    email_enabled: bool = False
    email_subject_template: str | None = None
    email_body_template: str | None = None
