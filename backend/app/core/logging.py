"""Logging helpers for application and payment callback logs."""

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from backend.app.core.config import get_settings


_CONFIGURED = False


def configure_logging() -> None:
    """Configure root logging once for the current process."""

    global _CONFIGURED
    if _CONFIGURED:
        return

    settings = get_settings()
    log_dir = settings.log_dir_path
    log_dir.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    if not root_logger.handlers:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        root_logger.addHandler(stream_handler)

    for filename, logger_name in [
        ("app.log", "nicefk"),
        ("pay_notify.log", "nicefk.payments.notify"),
        ("order_reconcile.log", "nicefk.reconcile"),
        ("mail.log", "nicefk.mail"),
    ]:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.INFO)
        file_handler = RotatingFileHandler(
            Path(log_dir, filename),
            maxBytes=2 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        logger.propagate = True

    _CONFIGURED = True
