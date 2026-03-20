"""FastAPI dependencies for database and authentication."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.services.auth_service import AuthService


DatabaseSession = Session


def require_auth(role: str):
    """Return a dependency that validates a session token for the given role."""

    async def dependency(
        authorization: str | None = Header(default=None),
        db: Session = Depends(get_db),
    ) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少登录凭证")
        token = authorization.split(" ", 1)[1].strip()
        session_payload = AuthService(db).get_session(token)
        if not session_payload or session_payload.get("role") != role:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录状态无效")
        return session_payload

    return dependency


AdminSession = Depends(require_auth("admin"))
AgentSession = Depends(require_auth("agent"))
