"""Scheduler registration for recurring background jobs."""

from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.app.core.config import get_settings
from backend.app.db.session import SessionLocal
from backend.app.services.order_service import OrderService


scheduler: BackgroundScheduler | None = None


def reconcile_pending_orders_job() -> None:
    """Background job wrapper using its own database session."""

    session = SessionLocal()
    try:
        OrderService(session).reconcile_pending_orders()
    finally:
        session.close()


def start_scheduler() -> BackgroundScheduler | None:
    """Start APScheduler if it is enabled in settings."""

    global scheduler
    if scheduler is not None:
        return scheduler

    settings = get_settings()
    if not settings.scheduler_enabled or settings.testing:
        return None

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        reconcile_pending_orders_job,
        trigger=IntervalTrigger(seconds=settings.reconcile_interval_seconds),
        id="reconcile_pending_orders",
        replace_existing=True,
    )
    scheduler.start()
    return scheduler


def stop_scheduler() -> None:
    """Stop the background scheduler if it is running."""

    global scheduler
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
