"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.api.admin import router as admin_router
from backend.app.api.agent import router as agent_router
from backend.app.api.payments import router as payments_router
from backend.app.api.public import router as public_router
from backend.app.core.config import get_settings
from backend.app.core.logging import configure_logging
from backend.app.db.base import Base
from backend.app.db.bootstrap import ensure_schema_compatibility
from backend.app.db.session import SessionLocal, engine
from backend.app.models import CdkCard, ConfigEntry, Goods, Order
from backend.app.services.config_service import ConfigService
from backend.app.services.task_service import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize logging, database tables, default config and scheduler."""

    configure_logging()
    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility(engine)
    session = SessionLocal()
    try:
        ConfigService(session).ensure_defaults()
    finally:
        session.close()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="nicefk", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public_router)
app.include_router(payments_router)
app.include_router(admin_router)
app.include_router(agent_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Lightweight health endpoint for local and Docker checks."""

    return {"status": "ok"}

settings = get_settings()
if settings.frontend_dist_path.exists() and (settings.frontend_dist_path / "index.html").exists():
    assets_dir = settings.frontend_dist_path / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def frontend_index() -> FileResponse:
        """Serve the React entry document."""

        return FileResponse(settings.frontend_dist_path / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend_routes(full_path: str) -> FileResponse:
        """Serve the React single-page app for non-API routes."""

        if full_path.startswith("api/") or full_path.startswith("healthz"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = settings.frontend_dist_path / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(settings.frontend_dist_path / "index.html")
