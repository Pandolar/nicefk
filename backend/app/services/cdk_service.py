"""CDK inventory service."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.base import now_local
from backend.app.models.cdk import CdkCard
from backend.app.models.goods import Goods
from backend.app.schemas.cdk import CdkBatchStatusRequest, CdkImportRequest


class CdkService:
    """Manage card inventory import and listing."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def list_cards(self, goods_id: int | None = None, status: str | None = None) -> list[CdkCard]:
        stmt = select(CdkCard).order_by(CdkCard.id.desc())
        if goods_id:
            stmt = stmt.where(CdkCard.goods_id == goods_id)
        if status:
            stmt = stmt.where(CdkCard.status == status)
        return list(self.session.scalars(stmt).all())

    def import_cards(self, payload: CdkImportRequest) -> dict[str, int]:
        goods = self.session.scalar(select(Goods).where(Goods.id == payload.goods_id))
        if not goods:
            raise ValueError("商品不存在，无法导入卡密")

        imported = 0
        skipped = 0
        seen_codes: set[str] = set()
        for raw_line in payload.cards_text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            card_code, card_secret = (line.split("----", 1) + [None])[:2]
            normalized_code = card_code.strip()
            if normalized_code in seen_codes:
                skipped += 1
                continue
            exists = self.session.scalar(
                select(CdkCard).where(CdkCard.goods_id == payload.goods_id, CdkCard.card_code == normalized_code)
            )
            if exists:
                skipped += 1
                continue
            seen_codes.add(normalized_code)
            self.session.add(
                CdkCard(
                    goods_id=payload.goods_id,
                    card_code=normalized_code,
                    card_secret=card_secret.strip() if card_secret else None,
                    status="unused",
                )
            )
            imported += 1
        self.session.commit()
        return {"imported": imported, "skipped": skipped}

    def batch_update_status(self, payload: CdkBatchStatusRequest) -> dict[str, int]:
        ids = sorted({int(card_id) for card_id in payload.ids if int(card_id) > 0})
        if not ids:
            raise ValueError("请选择要操作的卡密")

        changed = 0
        skipped = 0
        rows = list(self.session.scalars(select(CdkCard).where(CdkCard.id.in_(ids))).all())
        for card in rows:
            if payload.status == "frozen":
                if card.status != "unused":
                    skipped += 1
                    continue
                card.status = "frozen"
                changed += 1
            elif payload.status == "unused":
                if card.status != "frozen":
                    skipped += 1
                    continue
                card.status = "unused"
                changed += 1
            self.session.add(card)

        self.session.commit()
        return {"changed": changed, "skipped": skipped}

    def lock_next_available_card(self, goods_id: int) -> CdkCard | None:
        cards = self.lock_next_available_cards(goods_id, 1)
        return cards[0] if cards else None

    def lock_next_available_cards(self, goods_id: int, quantity: int) -> list[CdkCard]:
        """Lock the next available card within the current transaction.

        MySQL can use `FOR UPDATE`; SQLite in tests will simply return the first
        unused row, which is sufficient for deterministic unit tests.
        """

        if quantity <= 0:
            return []
        stmt = (
            select(CdkCard)
            .where(CdkCard.goods_id == goods_id, CdkCard.status == "unused")
            .order_by(CdkCard.id.asc())
            .limit(quantity)
        )
        bind = self.session.get_bind()
        if bind and bind.dialect.name != "sqlite":
            stmt = stmt.with_for_update(skip_locked=True)
        cards = list(self.session.scalars(stmt).all())
        if len(cards) < quantity:
            return []
        for card in cards:
            card.status = "locked"
            card.locked_at = now_local()
            self.session.add(card)
        self.session.flush()
        return cards
