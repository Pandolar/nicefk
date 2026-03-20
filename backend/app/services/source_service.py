"""Source channel configuration and analytics service."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.app.core.cache import get_cache
from backend.app.schemas.channel import ChannelBatchCreateRequest, ChannelRead, ChannelUpsert
from backend.app.services.config_service import ConfigService
from backend.app.services.goods_service import GoodsService


class SourceService:
    """Manage secondary source channels and their Redis-backed stats."""

    stats_prefix = "source:stats:"
    uv_prefix = "source:uv:"

    def __init__(self, session: Session) -> None:
        self.session = session
        self.cache = get_cache()
        self.config = ConfigService(session)

    def list_channels(self, agent_code: str | None = None, active_only: bool = False) -> list[dict[str, Any]]:
        rows = list(self.config.get_agent_channels())
        if agent_code:
            rows = [item for item in rows if item.get("agent_code") == agent_code]
        if active_only:
            rows = [item for item in rows if int(item.get("status", 1)) == 1]
        return rows

    def save_channel(
        self,
        payload: ChannelUpsert,
        original_agent_code: str | None = None,
        original_channel_code: str | None = None,
    ) -> dict[str, Any]:
        agent_exists = any(item.get("agent_code") == payload.agent_code for item in self.config.get_agent_accounts())
        if not agent_exists:
            raise ValueError("所属代理不存在")
        if payload.goods_id is not None:
            GoodsService(self.session).get_goods(payload.goods_id)
        return self.config.save_agent_channel(payload, original_agent_code, original_channel_code)

    def bulk_create_channels(self, payload: ChannelBatchCreateRequest) -> dict[str, Any]:
        imported = 0
        skipped = 0

        for raw_line in payload.rows_text.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            if "----" in line:
                parts = [part.strip() for part in line.split("----")]
            else:
                parts = [part.strip() for part in line.split(",")]

            channel_code = parts[0] if len(parts) > 0 else ""
            channel_name = parts[1] if len(parts) > 1 else channel_code
            promoter_name = parts[2] if len(parts) > 2 else None

            if not channel_code or not channel_name:
                skipped += 1
                continue

            try:
                self.save_channel(
                    ChannelUpsert(
                        agent_code=payload.agent_code,
                        channel_code=channel_code,
                        channel_name=channel_name,
                        promoter_name=promoter_name or None,
                        goods_id=payload.goods_id,
                        status=payload.status,
                        note=None,
                    )
                )
                imported += 1
            except ValueError:
                skipped += 1

        return {"imported": imported, "skipped": skipped}

    def get_channel(self, agent_code: str, channel_code: str) -> dict[str, Any] | None:
        for item in self.list_channels(agent_code=agent_code):
            if item.get("channel_code") == channel_code:
                return item
        return None

    def validate_channel(self, agent_code: str, channel_code: str) -> dict[str, Any]:
        item = self.get_channel(agent_code, channel_code)
        if not item or int(item.get("status", 1)) != 1:
            raise ValueError("来源渠道不存在或已禁用")
        return item

    def _stats_key(self, agent_code: str, channel_code: str) -> str:
        return f"{self.stats_prefix}{agent_code}:{channel_code}"

    def _uv_key(self, agent_code: str, channel_code: str, visitor_id: str) -> str:
        return f"{self.uv_prefix}{agent_code}:{channel_code}:{visitor_id}"

    def _read_stats(self, agent_code: str, channel_code: str) -> dict[str, Any]:
        stats = self.cache.get(self._stats_key(agent_code, channel_code))
        if isinstance(stats, dict):
            return {
                "visit_pv": int(stats.get("visit_pv", 0)),
                "visit_uv": int(stats.get("visit_uv", 0)),
                "order_count": int(stats.get("order_count", 0)),
                "paid_count": int(stats.get("paid_count", 0)),
                "paid_amount": str(stats.get("paid_amount", "0.00")),
            }
        return {"visit_pv": 0, "visit_uv": 0, "order_count": 0, "paid_count": 0, "paid_amount": "0.00"}

    def _write_stats(self, agent_code: str, channel_code: str, stats: dict[str, Any]) -> None:
        self.cache.set(self._stats_key(agent_code, channel_code), stats)

    def record_visit(self, agent_code: str, channel_code: str, visitor_id: str) -> None:
        self.validate_channel(agent_code, channel_code)
        stats = self._read_stats(agent_code, channel_code)
        stats["visit_pv"] += 1
        if self.cache.set(self._uv_key(agent_code, channel_code, visitor_id), "1", ex=30 * 24 * 3600, nx=True):
            stats["visit_uv"] += 1
        self._write_stats(agent_code, channel_code, stats)

    def record_order(self, agent_code: str | None, channel_code: str | None) -> None:
        if not agent_code or not channel_code:
            return
        stats = self._read_stats(agent_code, channel_code)
        stats["order_count"] += 1
        self._write_stats(agent_code, channel_code, stats)

    def record_paid(self, agent_code: str | None, channel_code: str | None, amount: Decimal) -> None:
        if not agent_code or not channel_code:
            return
        stats = self._read_stats(agent_code, channel_code)
        stats["paid_count"] += 1
        stats["paid_amount"] = str((Decimal(str(stats["paid_amount"])) + Decimal(str(amount))).quantize(Decimal("0.01")))
        self._write_stats(agent_code, channel_code, stats)

    def build_channel_read(self, item: dict[str, Any], site_url: str, fallback_goods_id: int | None = None) -> ChannelRead:
        stats = self._read_stats(item["agent_code"], item["channel_code"])
        goods_id = item.get("goods_id") or fallback_goods_id
        promo_link = None
        if goods_id:
            promo_link = f"{site_url}/goods/{goods_id}?agent_code={item['agent_code']}&channel_code={item['channel_code']}"
        return ChannelRead(
            agent_code=item["agent_code"],
            channel_code=item["channel_code"],
            channel_name=item.get("channel_name", ""),
            promoter_name=item.get("promoter_name"),
            goods_id=item.get("goods_id"),
            status=int(item.get("status", 1)),
            note=item.get("note"),
            created_at=item.get("created_at"),
            visit_pv=int(stats["visit_pv"]),
            visit_uv=int(stats["visit_uv"]),
            order_count=int(stats["order_count"]),
            paid_count=int(stats["paid_count"]),
            paid_amount=Decimal(str(stats["paid_amount"])),
            promo_link=promo_link,
        )
