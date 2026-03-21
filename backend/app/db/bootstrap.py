"""Schema compatibility helpers for lightweight deployments."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_schema_compatibility(engine: Engine) -> None:
    """Apply tiny additive migrations for existing databases.

    This project intentionally keeps deployment lightweight, so for additive
    columns we patch the schema in place during startup instead of requiring a
    full migration framework.
    """

    inspector = inspect(engine)
    if not inspector.has_table("fk_goods"):
        return

    goods_columns = {column["name"] for column in inspector.get_columns("fk_goods")}
    statements: list[str] = []

    if "stock_display_mode" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN stock_display_mode VARCHAR(16) NOT NULL DEFAULT 'real'")
    if "stock_display_text" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN stock_display_text TEXT NULL")
    if "cover_fit_mode" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN cover_fit_mode VARCHAR(16) NOT NULL DEFAULT 'cover'")
    if "cover_width" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN cover_width INTEGER NULL")
    if "cover_height" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN cover_height INTEGER NULL")
    if "delivery_instructions" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN delivery_instructions TEXT NULL")
    if "email_enabled" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN email_enabled BOOLEAN NOT NULL DEFAULT 0")
    if "email_subject_template" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN email_subject_template TEXT NULL")
    if "email_body_template" not in goods_columns:
        statements.append("ALTER TABLE fk_goods ADD COLUMN email_body_template TEXT NULL")

    if inspector.has_table("fk_orders"):
        order_columns = {column["name"] for column in inspector.get_columns("fk_orders")}
        if "quantity" not in order_columns:
            statements.append("ALTER TABLE fk_orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1")
        if "email_status" not in order_columns:
            statements.append("ALTER TABLE fk_orders ADD COLUMN email_status VARCHAR(16) NULL")
        if "email_sent_at" not in order_columns:
            statements.append("ALTER TABLE fk_orders ADD COLUMN email_sent_at DATETIME NULL")
        if "email_error" not in order_columns:
            statements.append("ALTER TABLE fk_orders ADD COLUMN email_error VARCHAR(255) NULL")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
