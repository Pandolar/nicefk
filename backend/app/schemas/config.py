"""Schema models for site and config endpoints."""

from typing import Any

from pydantic import BaseModel


class SiteInfo(BaseModel):
    """Public site configuration exposed to the storefront."""

    site_name: str
    notice: str
    footer: str
    site_url: str
    extra_js: str = ""


class ConfigItem(BaseModel):
    """Config entry used by admin APIs."""

    config_key: str
    config_value: Any
    config_type: str
    group_name: str
    description: str | None = None
    is_sensitive: bool = False


class ConfigUpdateRequest(BaseModel):
    """Admin config update payload."""

    value: Any
