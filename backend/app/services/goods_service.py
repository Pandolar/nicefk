"""Goods related business logic."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.cache import get_cache
from backend.app.models.cdk import CdkCard
from backend.app.models.goods import Goods
from backend.app.schemas.goods import GoodsCreate, GoodsRead, GoodsUpdate


class GoodsService:
    """Service for storefront and admin goods management."""

    public_list_cache_key = "goods:public:list"
    public_detail_cache_prefix = "goods:public:detail:"
    public_cache_ttl = 300

    def __init__(self, session: Session) -> None:
        self.session = session
        self.cache = get_cache()

    def list_goods(self, public_only: bool = False) -> list[Goods]:
        stmt = select(Goods).order_by(Goods.sort_order.desc(), Goods.id.desc())
        if public_only:
            stmt = stmt.where(Goods.status == "on")
        return list(self.session.scalars(stmt).all())

    def get_goods(self, goods_id: int, public_only: bool = False) -> Goods:
        stmt = select(Goods).where(Goods.id == goods_id)
        if public_only:
            stmt = stmt.where(Goods.status == "on")
        goods = self.session.scalar(stmt)
        if not goods:
            raise ValueError("商品不存在")
        return goods

    def create_goods(self, payload: GoodsCreate) -> Goods:
        goods = Goods(**payload.model_dump())
        self.session.add(goods)
        self.session.commit()
        self.session.refresh(goods)
        self.clear_public_cache([goods.id])
        return goods

    def update_goods(self, goods_id: int, payload: GoodsUpdate) -> Goods:
        goods = self.get_goods(goods_id)
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(goods, field, value)
        self.session.add(goods)
        self.session.commit()
        self.session.refresh(goods)
        self.clear_public_cache([goods.id])
        return goods

    def available_stock(self, goods_id: int) -> int:
        stmt = select(func.count(CdkCard.id)).where(CdkCard.goods_id == goods_id, CdkCard.status == "unused")
        return int(self.session.scalar(stmt) or 0)

    def _public_detail_key(self, goods_id: int) -> str:
        return f"{self.public_detail_cache_prefix}{goods_id}"

    def _serialize_public_goods(self, goods: Goods) -> dict:
        item = GoodsRead.model_validate(goods)
        item.available_stock = self.available_stock(goods.id)
        return item.model_dump(mode="json")

    def list_public_goods_cached(self) -> list[GoodsRead]:
        cached = self.cache.get(self.public_list_cache_key)
        if isinstance(cached, list):
            return [GoodsRead(**item) for item in cached if isinstance(item, dict)]

        payload = [self._serialize_public_goods(goods) for goods in self.list_goods(public_only=True)]
        self.cache.set(self.public_list_cache_key, payload, ex=self.public_cache_ttl)
        return [GoodsRead(**item) for item in payload]

    def get_public_goods_cached(self, goods_id: int) -> GoodsRead:
        cached = self.cache.get(self._public_detail_key(goods_id))
        if isinstance(cached, dict):
            return GoodsRead(**cached)

        goods = self.get_goods(goods_id, public_only=True)
        payload = self._serialize_public_goods(goods)
        self.cache.set(self._public_detail_key(goods_id), payload, ex=self.public_cache_ttl)
        return GoodsRead(**payload)

    def clear_public_cache(self, goods_ids: list[int] | None = None) -> int:
        cleared = 0
        self.cache.delete(self.public_list_cache_key)
        cleared += 1

        if goods_ids is None:
            goods_ids = [int(item.id) for item in self.list_goods()]

        for goods_id in sorted({int(goods_id) for goods_id in goods_ids if int(goods_id) > 0}):
            self.cache.delete(self._public_detail_key(goods_id))
            cleared += 1
        return cleared
