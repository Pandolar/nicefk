"""Authentication service for admin and agent backoffice access."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.app.core.cache import get_cache
from backend.app.core.config import get_settings
from backend.app.core.security import generate_token, verify_password
from backend.app.services.config_service import ConfigService


class AuthService:
    """Authenticate admin and agent users defined in config."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.cache = get_cache()
        self.config = ConfigService(session)

    def _save_session(self, payload: dict[str, Any]) -> str:
        token = generate_token()
        ttl_seconds = get_settings().token_ttl_hours * 3600
        self.cache.set(f"session:{token}", payload, ex=ttl_seconds)
        return token

    def login_admin(self, username: str, password: str) -> dict[str, Any]:
        """Authenticate an admin account and return a session token."""

        for account in self.config.get_admin_accounts():
            if account.get("username") == username and int(account.get("status", 1)) == 1:
                if verify_password(password, account.get("password_hash", "")):
                    token = self._save_session(
                        {
                            "role": "admin",
                            "username": username,
                            "display_name": account.get("display_name", username),
                        }
                    )
                    return {
                        "token": token,
                        "role": "admin",
                        "display_name": account.get("display_name", username),
                    }
        raise ValueError("管理员账号或密码错误")

    def login_agent(self, username: str, password: str) -> dict[str, Any]:
        """Authenticate an agent account and return a session token."""

        for account in self.config.get_agent_accounts():
            if account.get("username") == username and int(account.get("status", 1)) == 1:
                if verify_password(password, account.get("password_hash", "")):
                    token = self._save_session(
                        {
                            "role": "agent",
                            "username": username,
                            "display_name": account.get("agent_name", username),
                            "agent_code": account.get("agent_code"),
                            "allowed_goods_ids": account.get("allowed_goods_ids", []),
                        }
                    )
                    return {
                        "token": token,
                        "role": "agent",
                        "display_name": account.get("agent_name", username),
                        "agent_code": account.get("agent_code"),
                    }
        raise ValueError("代理账号或密码错误")

    def get_session(self, token: str) -> dict[str, Any] | None:
        """Read a previously stored session token."""

        session = self.cache.get(f"session:{token}")
        return session if isinstance(session, dict) else None
