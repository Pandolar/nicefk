"""Agent backoffice APIs."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import require_auth
from backend.app.db.session import get_db
from backend.app.schemas.channel import ChannelBatchCreateRequest, ChannelRead, ChannelUpsert
from backend.app.schemas.common import ApiResponse
from backend.app.schemas.goods import GoodsRead
from backend.app.schemas.order import LoginRequest, LoginResult, OrderRead
from backend.app.services.auth_service import AuthService
from backend.app.services.config_service import ConfigService
from backend.app.services.goods_service import GoodsService
from backend.app.services.order_service import OrderService
from backend.app.services.source_service import SourceService


router = APIRouter(prefix="/api/agent", tags=["agent"])
agent_auth = require_auth("agent")


@router.post("/auth/login", response_model=ApiResponse[LoginResult])
async def agent_login(payload: LoginRequest, db: Session = Depends(get_db)) -> ApiResponse[LoginResult]:
    try:
        result = AuthService(db).login_agent(payload.username, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="登录成功", data=LoginResult(**result))


@router.get("/dashboard", response_model=ApiResponse[dict])
async def agent_dashboard(session_payload: dict = Depends(agent_auth), db: Session = Depends(get_db)) -> ApiResponse[dict]:
    summary = OrderService(db).dashboard_summary(agent_code=session_payload["agent_code"])
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    allowed_goods_ids = session_payload.get("allowed_goods_ids", [])
    source_service = SourceService(db)
    channels = [
        source_service.build_channel_read(item, site_url, allowed_goods_ids[0] if allowed_goods_ids else None)
        for item in source_service.list_channels(agent_code=session_payload["agent_code"])
    ]
    summary["agent_code"] = session_payload["agent_code"]
    summary["display_name"] = session_payload["display_name"]
    summary["site_url"] = site_url
    summary["allowed_goods_ids"] = allowed_goods_ids
    summary["channel_count"] = len(channels)
    summary["channels"] = channels
    return ApiResponse(message="获取成功", data=summary)


@router.get("/orders", response_model=ApiResponse[list[OrderRead]])
async def agent_orders(session_payload: dict = Depends(agent_auth), db: Session = Depends(get_db)) -> ApiResponse[list[OrderRead]]:
    service = OrderService(db)
    data = [
        service.build_order_read(order)
        for order in service.list_orders(agent_code=session_payload["agent_code"])
        if order.status == "delivered"
    ]
    return ApiResponse(message="获取成功", data=data)


@router.get("/channels", response_model=ApiResponse[list[ChannelRead]])
async def agent_channels(session_payload: dict = Depends(agent_auth), db: Session = Depends(get_db)) -> ApiResponse[list[ChannelRead]]:
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    allowed_goods_ids = session_payload.get("allowed_goods_ids", [])
    fallback_goods_id = allowed_goods_ids[0] if allowed_goods_ids else None
    service = SourceService(db)
    rows = [
        service.build_channel_read(item, site_url, fallback_goods_id)
        for item in service.list_channels(agent_code=session_payload["agent_code"])
    ]
    return ApiResponse(message="获取成功", data=rows)


@router.get("/goods", response_model=ApiResponse[list[GoodsRead]])
async def agent_goods(session_payload: dict = Depends(agent_auth), db: Session = Depends(get_db)) -> ApiResponse[list[GoodsRead]]:
    service = GoodsService(db)
    allowed_goods_ids = set(session_payload.get("allowed_goods_ids", []))
    data = []
    for goods in service.list_goods():
        if allowed_goods_ids and goods.id not in allowed_goods_ids:
            continue
        item = GoodsRead.model_validate(goods)
        item.available_stock = service.available_stock(goods.id)
        data.append(item)
    return ApiResponse(message="获取成功", data=data)


@router.post("/channels", response_model=ApiResponse[ChannelRead])
async def agent_create_channel(
    payload: ChannelUpsert,
    session_payload: dict = Depends(agent_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[ChannelRead]:
    service = SourceService(db)
    allowed_goods_ids = set(session_payload.get("allowed_goods_ids", []))
    if payload.agent_code != session_payload["agent_code"]:
        raise HTTPException(status_code=400, detail="只能创建属于自己的渠道")
    if allowed_goods_ids and payload.goods_id and payload.goods_id not in allowed_goods_ids:
        raise HTTPException(status_code=400, detail="当前商品不在你的可推广范围内")
    try:
        item = service.save_channel(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    fallback_goods_id = payload.goods_id or (next(iter(allowed_goods_ids)) if allowed_goods_ids else None)
    return ApiResponse(message="创建成功", data=service.build_channel_read(item, site_url, fallback_goods_id))


@router.put("/channels/{channel_code}", response_model=ApiResponse[ChannelRead])
async def agent_update_channel(
    channel_code: str,
    payload: ChannelUpsert,
    session_payload: dict = Depends(agent_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[ChannelRead]:
    service = SourceService(db)
    allowed_goods_ids = set(session_payload.get("allowed_goods_ids", []))
    if payload.agent_code != session_payload["agent_code"]:
        raise HTTPException(status_code=400, detail="只能维护属于自己的渠道")
    if allowed_goods_ids and payload.goods_id and payload.goods_id not in allowed_goods_ids:
        raise HTTPException(status_code=400, detail="当前商品不在你的可推广范围内")
    try:
        item = service.save_channel(payload, original_agent_code=session_payload["agent_code"], original_channel_code=channel_code)
    except ValueError as exc:
        status_code = 404 if str(exc) == "来源渠道不存在" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    fallback_goods_id = payload.goods_id or (next(iter(allowed_goods_ids)) if allowed_goods_ids else None)
    return ApiResponse(message="更新成功", data=service.build_channel_read(item, site_url, fallback_goods_id))


@router.post("/channels/batch", response_model=ApiResponse[dict])
async def agent_create_channels_batch(
    payload: ChannelBatchCreateRequest,
    session_payload: dict = Depends(agent_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    allowed_goods_ids = set(session_payload.get("allowed_goods_ids", []))
    if payload.agent_code != session_payload["agent_code"]:
        raise HTTPException(status_code=400, detail="只能创建属于自己的渠道")
    if allowed_goods_ids and payload.goods_id and payload.goods_id not in allowed_goods_ids:
        raise HTTPException(status_code=400, detail="当前商品不在你的可推广范围内")
    try:
        result = SourceService(db).bulk_create_channels(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="批量创建完成", data=result)
