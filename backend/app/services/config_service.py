"""Services for typed configuration access and default bootstrapping."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.cache import get_cache
from backend.app.core.config import get_settings
from backend.app.core.security import hash_password
from backend.app.db.base import now_local
from backend.app.models.config import ConfigEntry
from backend.app.schemas.agent import AgentAccountUpsert
from backend.app.schemas.channel import ChannelUpsert


@dataclass(frozen=True)
class ConfigSeed:
    """Definition of one bootstrap configuration item."""

    key: str
    value: Any
    config_type: str
    group_name: str
    description: str
    is_sensitive: bool = False


def _default_admin_accounts() -> list[dict[str, Any]]:
    return [
        {
            "username": "admin",
            "display_name": "系统管理员",
            "password_hash": hash_password("Admin@123456"),
            "status": 1,
        }
    ]


def _default_agent_accounts() -> list[dict[str, Any]]:
    return [
        {
            "agent_code": "agent_demo",
            "agent_name": "演示代理",
            "username": "agent_demo",
            "password_hash": hash_password("Agent@123456"),
            "status": 1,
            "allowed_goods_ids": [],
        }
    ]


def _default_agent_channels() -> list[dict[str, Any]]:
    return [
        {
            "agent_code": "agent_demo",
            "channel_code": "blogger_demo",
            "channel_name": "演示博主",
            "promoter_name": "演示博主",
            "goods_id": 1,
            "status": 1,
            "note": "默认二级渠道示例",
            "created_at": now_local().isoformat(),
        }
    ]


DEFAULT_CONFIGS: list[ConfigSeed] = [
    ConfigSeed("SITE_NAME", "", "string", "site", "站点名称"),
    ConfigSeed("SITE_NOTICE", "请在支付前确认联系方式填写正确，支付成功后系统会自动发货。", "text", "site", "全站统一公告"),
    ConfigSeed("SITE_FOOTER", "", "string", "site", "页脚文案"),
    ConfigSeed("SITE_EXTRA_JS", "", "text", "site", "前台额外 JS，将注入到公共页面"),
    ConfigSeed("SITE_URL", get_settings().site_url, "string", "site", "站点访问地址"),
    ConfigSeed("PAY_EPAY_PID", "", "string", "payment", "ePay 商户 PID", True),
    ConfigSeed("PAY_EPAY_KEY", "", "string", "payment", "ePay 商户密钥", True),
    ConfigSeed("PAY_EPAY_API_URL", "https://pay.example.com/", "string", "payment", "ePay 网关基础地址"),
    ConfigSeed("PAY_EPAY_SUBMIT_URL", "https://pay.example.com/submit.php", "string", "payment", "ePay 提交地址"),
    ConfigSeed("PAY_EPAY_QUERY_URL", "https://pay.example.com/api.php", "string", "payment", "ePay 查单地址"),
    ConfigSeed("PAY_NOTIFY_URL", f"{get_settings().site_url}/api/payments/epay/notify", "string", "payment", "异步通知地址"),
    ConfigSeed("PAY_RETURN_URL", f"{get_settings().site_url}/payment-return", "string", "payment", "同步跳转地址"),
    ConfigSeed("ORDER_EXPIRE_MINUTES", get_settings().order_expire_minutes, "int", "payment", "订单过期分钟数"),
    ConfigSeed("SMTP_SERVER", "", "string", "mail", "SMTP 服务器地址"),
    ConfigSeed("SMTP_PORT", 465, "int", "mail", "SMTP 端口"),
    ConfigSeed("SMTP_USER", "", "string", "mail", "SMTP 用户名"),
    ConfigSeed("SMTP_PASSWORD", "", "string", "mail", "SMTP 密码", True),
    ConfigSeed("SMTP_FROM", "", "string", "mail", "发件人显示名称"),
    ConfigSeed("EMAIL_ENABLED", False, "bool", "mail", "是否启用自动发货邮件"),
    ConfigSeed("EMAIL_DEFAULT_SUBJECT", "您的订单 {{order_no}} 已自动发货", "text", "mail", "默认邮件主题模板"),
    ConfigSeed(
        "EMAIL_DEFAULT_TEMPLATE",
        "<h2>订单发货成功</h2><p>商品：{{goods_title}}</p><p>订单号：{{order_no}}</p><p>支付时间：{{pay_time}}</p><p>卡密：{{card_code}}</p><p>附加密钥（如有）：{{card_secret}}</p>",
        "text",
        "mail",
        "默认邮件正文模板（HTML）",
    ),
    ConfigSeed(
        "DELIVERY_DEFAULT_TEMPLATE",
        "请按照商品说明完成使用，如有疑问请联系商家客服并提供订单号。",
        "text",
        "goods",
        "默认发货说明模板",
    ),
    ConfigSeed("ADMIN_ACCOUNTS", _default_admin_accounts(), "json", "security", "管理员账号配置", True),
    ConfigSeed("AGENT_ACCOUNTS", _default_agent_accounts(), "json", "agent", "代理账号配置", True),
    ConfigSeed("AGENT_CHANNELS", _default_agent_channels(), "json", "agent", "代理来源渠道配置", True),
]


class ConfigService:
    """Typed read/write access around the config table."""

    cache_prefix = "cfg:"

    def __init__(self, session: Session) -> None:
        self.session = session
        self.cache = get_cache()

    @staticmethod
    def serialize(value: Any, config_type: str) -> str:
        """Serialize Python values into the database text representation."""

        if config_type in {"json", "text"}:
            if config_type == "json":
                return json.dumps(value, ensure_ascii=False)
            return str(value)
        if config_type == "bool":
            return "1" if bool(value) else "0"
        return str(value)

    @staticmethod
    def deserialize(value: str | None, config_type: str) -> Any:
        """Convert stored text back to a typed Python value."""

        if value is None:
            return None
        if config_type == "json":
            return json.loads(value)
        if config_type == "int":
            return int(value)
        if config_type == "bool":
            return value in {"1", "true", "True", True}
        return value

    def ensure_defaults(self) -> None:
        """Create all required default config items if they do not exist."""

        for item in DEFAULT_CONFIGS:
            existing = self.session.scalar(select(ConfigEntry).where(ConfigEntry.config_key == item.key))
            if existing:
                continue
            self.session.add(
                ConfigEntry(
                    config_key=item.key,
                    config_value=self.serialize(item.value, item.config_type),
                    config_type=item.config_type,
                    group_name=item.group_name,
                    description=item.description,
                    is_sensitive=item.is_sensitive,
                )
            )
        self.session.commit()

    def get(self, key: str, default: Any = None) -> Any:
        """Return a typed config value with Redis-backed caching."""

        cache_key = f"{self.cache_prefix}{key}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        entry = self.session.scalar(select(ConfigEntry).where(ConfigEntry.config_key == key))
        if not entry:
            return default
        value = self.deserialize(entry.config_value, entry.config_type)
        self.cache.set(cache_key, value, ex=get_settings().config_cache_ttl_seconds)
        return value

    def set(self, key: str, value: Any) -> ConfigEntry:
        """Update a config item and invalidate its cache entry."""

        entry = self.session.scalar(select(ConfigEntry).where(ConfigEntry.config_key == key))
        if not entry:
            raise ValueError(f"配置项不存在: {key}")
        entry.config_value = self.serialize(value, entry.config_type)
        self.session.add(entry)
        self.session.commit()
        self.cache.delete(f"{self.cache_prefix}{key}")
        return entry

    def clear_all_cache(self) -> int:
        """Clear all config cache entries currently managed by the config table."""

        keys = [item.config_key for item in self.list_all()]
        for key in keys:
            self.cache.delete(f"{self.cache_prefix}{key}")
        return len(keys)

    def list_all(self) -> list[ConfigEntry]:
        """Return all config entries sorted by group and key."""

        return list(self.session.scalars(select(ConfigEntry).order_by(ConfigEntry.group_name, ConfigEntry.config_key)).all())

    def get_site_info(self) -> dict[str, Any]:
        """Assemble the public site info payload."""

        return {
            "site_name": self.get("SITE_NAME", ""),
            "notice": self.get("SITE_NOTICE", ""),
            "footer": self.get("SITE_FOOTER", ""),
            "site_url": self.get("SITE_URL", get_settings().site_url),
            "extra_js": self.get("SITE_EXTRA_JS", ""),
        }

    def get_admin_accounts(self) -> list[dict[str, Any]]:
        """Load admin account definitions from config."""

        return self.get("ADMIN_ACCOUNTS", [])

    def save_admin_password(self, username: str, new_password: str) -> dict[str, Any]:
        """Update one admin password stored inside config JSON."""

        accounts = list(self.get_admin_accounts())
        target = None
        for item in accounts:
            if item.get("username") == username:
                target = item
                break
        if not target:
            raise ValueError("管理员不存在")

        saved = {
            **target,
            "password_hash": hash_password(new_password),
        }
        accounts[accounts.index(target)] = saved
        self.set("ADMIN_ACCOUNTS", accounts)
        return saved

    def get_agent_accounts(self) -> list[dict[str, Any]]:
        """Load agent account definitions from config."""

        return self.get("AGENT_ACCOUNTS", [])

    def save_agent_account(self, payload: AgentAccountUpsert, original_agent_code: str | None = None) -> dict[str, Any]:
        """Create or update one agent definition stored inside config JSON."""

        accounts = list(self.get_agent_accounts())
        original = None
        for item in accounts:
            if item.get("agent_code") == (original_agent_code or payload.agent_code):
                original = item
                break

        if original_agent_code and not original:
            raise ValueError("代理不存在")
        if not original and not payload.password:
            raise ValueError("新建代理时必须填写登录密码")

        for item in accounts:
            if item is original:
                continue
            if item.get("agent_code") == payload.agent_code:
                raise ValueError("代理编码已存在")
            if item.get("username") == payload.username:
                raise ValueError("代理登录账号已存在")

        allowed_goods_ids = sorted({int(goods_id) for goods_id in payload.allowed_goods_ids if int(goods_id) > 0})
        saved = {
            "agent_code": payload.agent_code,
            "agent_name": payload.agent_name,
            "username": payload.username,
            "password_hash": original.get("password_hash") if original else "",
            "status": int(payload.status),
            "allowed_goods_ids": allowed_goods_ids,
        }
        if payload.password:
            saved["password_hash"] = hash_password(payload.password)
        if not saved["password_hash"]:
            raise ValueError("代理密码不能为空")

        if original:
            accounts[accounts.index(original)] = saved
        else:
            accounts.append(saved)
        self.set("AGENT_ACCOUNTS", accounts)
        return saved

    def get_agent_channels(self) -> list[dict[str, Any]]:
        """Load channel definitions from config."""

        rows = list(self.get("AGENT_CHANNELS", []))
        changed = False
        for item in rows:
            if not item.get("created_at"):
                item["created_at"] = now_local().isoformat()
                changed = True
        if changed:
            self.set("AGENT_CHANNELS", rows)
        return rows

    def save_agent_channel(
        self,
        payload: ChannelUpsert,
        original_agent_code: str | None = None,
        original_channel_code: str | None = None,
    ) -> dict[str, Any]:
        """Create or update one source channel stored inside config JSON."""

        channels = list(self.get_agent_channels())
        original = None
        lookup_agent = original_agent_code or payload.agent_code
        lookup_channel = original_channel_code or payload.channel_code
        for item in channels:
            if item.get("agent_code") == lookup_agent and item.get("channel_code") == lookup_channel:
                original = item
                break

        if original_agent_code and original_channel_code and not original:
            raise ValueError("来源渠道不存在")

        for item in channels:
            if item is original:
                continue
            if item.get("agent_code") == payload.agent_code and item.get("channel_code") == payload.channel_code:
                raise ValueError("该代理下渠道编码已存在")

        saved = {
            "agent_code": payload.agent_code,
            "channel_code": payload.channel_code,
            "channel_name": payload.channel_name,
            "promoter_name": payload.promoter_name,
            "goods_id": payload.goods_id,
            "status": int(payload.status),
            "note": payload.note,
            "created_at": original.get("created_at") if original else now_local().isoformat(),
        }

        if original:
            channels[channels.index(original)] = saved
        else:
            channels.append(saved)
        self.set("AGENT_CHANNELS", channels)
        return saved
