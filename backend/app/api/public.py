"""Public storefront APIs."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.schemas.channel import ChannelVisitRequest
from backend.app.schemas.common import ApiResponse
from backend.app.schemas.config import SiteInfo
from backend.app.schemas.goods import GoodsRead
from backend.app.schemas.order import CreateOrderRequest, OrderCheckRequest, OrderCreated, OrderRead, OrderSearchRequest
from backend.app.services.config_service import ConfigService
from backend.app.services.goods_service import GoodsService
from backend.app.services.order_service import OrderService
from backend.app.services.source_service import SourceService


router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/site", response_model=ApiResponse[SiteInfo])
async def get_site(db: Session = Depends(get_db)) -> ApiResponse[SiteInfo]:
    service = ConfigService(db)
    return ApiResponse(message="获取成功", data=SiteInfo(**service.get_site_info()))


@router.get("/goods", response_model=ApiResponse[list[GoodsRead]])
async def list_goods(db: Session = Depends(get_db)) -> ApiResponse[list[GoodsRead]]:
    items = GoodsService(db).list_public_goods_cached()
    return ApiResponse(message="获取成功", data=items)


@router.get("/goods/{goods_id}", response_model=ApiResponse[GoodsRead])
async def get_goods(goods_id: int, db: Session = Depends(get_db)) -> ApiResponse[GoodsRead]:
    service = GoodsService(db)
    try:
        item = service.get_public_goods_cached(goods_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiResponse(message="获取成功", data=item)


@router.post("/goods/{goods_id}/visit", response_model=ApiResponse[dict])
async def track_goods_visit(goods_id: int, payload: ChannelVisitRequest, db: Session = Depends(get_db)) -> ApiResponse[dict]:
    try:
        GoodsService(db).get_goods(goods_id, public_only=True)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        SourceService(db).record_visit(payload.agent_code, payload.channel_code, payload.visitor_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="记录成功", data={"recorded": True})


@router.post("/orders", response_model=ApiResponse[OrderCreated])
async def create_order(payload: CreateOrderRequest, request: Request, db: Session = Depends(get_db)) -> ApiResponse[OrderCreated]:
    service = OrderService(db)
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        order, payment = service.create_order(payload, client_ip)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(
        message="下单成功",
        data=OrderCreated(order_no=order.order_no, status=order.status, amount=order.amount, payment=payment),
    )


@router.get("/orders/{order_no}", response_model=ApiResponse[OrderRead])
async def get_order(
    order_no: str,
    buyer_contact: str = Query(..., description="用于校验订单归属的手机号或邮箱"),
    db: Session = Depends(get_db),
) -> ApiResponse[OrderRead]:
    service = OrderService(db)
    try:
        order = service.get_order_for_public(order_no, buyer_contact)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiResponse(message="获取成功", data=OrderRead.model_validate(order))


@router.post("/orders/{order_no}/check", response_model=ApiResponse[OrderRead])
async def check_order(
    order_no: str,
    payload: OrderCheckRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[OrderRead]:
    service = OrderService(db)
    try:
        order = service.reconcile_one_order(order_no, payload.buyer_contact)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="检查完成", data=OrderRead.model_validate(order))


@router.post("/orders/search", response_model=ApiResponse[list[OrderRead]])
async def search_orders(payload: OrderSearchRequest, db: Session = Depends(get_db)) -> ApiResponse[list[OrderRead]]:
    service = OrderService(db)
    try:
        rows = service.search_public_orders(order_no=payload.order_no, buyer_contact=payload.buyer_contact)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="查询成功", data=[OrderRead.model_validate(item) for item in rows])
