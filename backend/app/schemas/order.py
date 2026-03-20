"""Schema models for order flows."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CreateOrderRequest(BaseModel):
    """Public order creation payload."""

    goods_id: int
    buyer_contact: str = Field(..., min_length=5, max_length=120)
    quantity: int = Field(default=1, ge=1, le=100)
    payment_method: str = Field(default="wxpay")
    device: str = Field(default="pc", max_length=16)
    agent_code: str | None = Field(default=None, max_length=64)
    channel_code: str | None = Field(default=None, max_length=64)
    source_raw: dict[str, Any] | None = None


class PaymentPayload(BaseModel):
    """Front-end payment form payload."""

    submit_url: str
    method: str = "POST"
    fields: dict[str, str]


class OrderCreated(BaseModel):
    """Response returned after creating a pending order."""

    order_no: str
    status: str
    amount: Decimal
    payment: PaymentPayload


class OrderRead(BaseModel):
    """Public and admin order payload."""

    model_config = ConfigDict(from_attributes=True)

    order_no: str
    trade_no: str | None = None
    goods_id: int
    buyer_contact: str
    contact_type: str
    quantity: int = 1
    amount: Decimal
    pay_method: str
    status: str
    agent_code: str | None = None
    agent_name: str | None = None
    source_channel_code: str | None = None
    source_channel_name: str | None = None
    card_snapshot: dict[str, Any] | None = None
    fail_reason: str | None = None
    created_at: datetime
    pay_time: datetime | None = None
    deliver_time: datetime | None = None
    expire_time: datetime | None = None
    email_status: str | None = None
    email_sent_at: datetime | None = None
    email_error: str | None = None


class OrderLookupQuery(BaseModel):
    """Lookup payload for public order query endpoint."""

    buyer_contact: str


class OrderCheckRequest(BaseModel):
    """Manual payment status check payload from the public order page."""

    buyer_contact: str


class OrderSearchRequest(BaseModel):
    """Public order search payload."""

    order_no: str | None = None
    buyer_contact: str | None = None


class LoginRequest(BaseModel):
    """Login request shared by admin and agent."""

    username: str
    password: str


class LoginResult(BaseModel):
    """Login result returned by auth APIs."""

    token: str
    role: str
    display_name: str
    agent_code: str | None = None
