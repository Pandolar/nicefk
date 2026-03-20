"""Schema models for agent account management."""

from pydantic import BaseModel, Field


class AgentAccountBase(BaseModel):
    """Shared agent account fields."""

    agent_code: str = Field(..., min_length=2, max_length=64)
    agent_name: str = Field(..., min_length=1, max_length=120)
    username: str = Field(..., min_length=2, max_length=64)
    status: int = 1
    allowed_goods_ids: list[int] = Field(default_factory=list)


class AgentAccountUpsert(AgentAccountBase):
    """Payload for creating or updating one agent."""

    password: str | None = Field(default=None, min_length=6, max_length=120)


class AgentAccountRead(AgentAccountBase):
    """Agent account payload returned to admin pages."""
