"""Goods related business logic."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.cdk import CdkCard
from backend.app.models.goods import Goods
from backend.app.schemas.goods import GoodsCreate, GoodsUpdate


class GoodsService:
    """Service for storefront and admin goods management."""

    def __init__(self, session: Session) -> None:
        self.session = session

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
        return goods

    def update_goods(self, goods_id: int, payload: GoodsUpdate) -> Goods:
        goods = self.get_goods(goods_id)
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(goods, field, value)
        self.session.add(goods)
        self.session.commit()
        self.session.refresh(goods)
        return goods

    def available_stock(self, goods_id: int) -> int:
        stmt = select(func.count(CdkCard.id)).where(CdkCard.goods_id == goods_id, CdkCard.status == "unused")
        return int(self.session.scalar(stmt) or 0)
