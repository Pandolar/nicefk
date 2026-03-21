"""Admin backoffice APIs."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.api.deps import require_auth
from backend.app.db.session import get_db
from backend.app.schemas.agent import AgentAccountRead, AgentAccountUpsert
from backend.app.schemas.channel import ChannelBatchCreateRequest, ChannelRead, ChannelUpsert
from backend.app.schemas.cdk import CdkBatchStatusRequest, CdkImportRequest, CdkRead
from backend.app.schemas.common import ApiResponse
from backend.app.schemas.config import ConfigItem, ConfigUpdateRequest
from backend.app.schemas.goods import GoodsAdminRead, GoodsCreate, GoodsRead, GoodsUpdate
from backend.app.schemas.order import LoginRequest, LoginResult, OrderRead, PasswordChangeRequest
from backend.app.services.auth_service import AuthService
from backend.app.services.cdk_service import CdkService
from backend.app.services.config_service import ConfigService
from backend.app.services.goods_service import GoodsService
from backend.app.services.order_service import OrderService
from backend.app.services.source_service import SourceService


router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_auth = require_auth("admin")


@router.post("/auth/login", response_model=ApiResponse[LoginResult])
async def admin_login(payload: LoginRequest, db: Session = Depends(get_db)) -> ApiResponse[LoginResult]:
    try:
        result = AuthService(db).login_admin(payload.username, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="登录成功", data=LoginResult(**result))


@router.post("/auth/change-password", response_model=ApiResponse[dict])
async def admin_change_password(
    payload: PasswordChangeRequest,
    session_payload: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    try:
        AuthService(db).change_admin_password(
            session_payload["username"],
            payload.current_password,
            payload.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="密码修改成功", data={"updated": True})


@router.get("/dashboard", response_model=ApiResponse[dict])
async def admin_dashboard(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[dict]:
    order_service = OrderService(db)
    goods_service = GoodsService(db)
    cdk_service = CdkService(db)
    summary = order_service.dashboard_summary()
    summary.update(
        {
            "goods_count": len(goods_service.list_goods()),
            "card_count": len(cdk_service.list_cards()),
        }
    )
    return ApiResponse(message="获取成功", data=summary)


@router.get("/goods", response_model=ApiResponse[list[GoodsAdminRead]])
async def admin_goods(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[list[GoodsAdminRead]]:
    service = GoodsService(db)
    data = []
    for goods in service.list_goods():
        item = GoodsAdminRead.model_validate(goods)
        item.available_stock = service.available_stock(goods.id)
        data.append(item)
    return ApiResponse(message="获取成功", data=data)


@router.post("/goods", response_model=ApiResponse[GoodsAdminRead])
async def create_goods(payload: GoodsCreate, _: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[GoodsAdminRead]:
    goods = GoodsService(db).create_goods(payload)
    item = GoodsAdminRead.model_validate(goods)
    item.available_stock = 0
    return ApiResponse(message="创建成功", data=item)


@router.put("/goods/{goods_id}", response_model=ApiResponse[GoodsAdminRead])
async def update_goods(goods_id: int, payload: GoodsUpdate, _: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[GoodsAdminRead]:
    try:
        goods = GoodsService(db).update_goods(goods_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    item = GoodsAdminRead.model_validate(goods)
    item.available_stock = GoodsService(db).available_stock(goods.id)
    return ApiResponse(message="更新成功", data=item)


@router.get("/orders", response_model=ApiResponse[list[OrderRead]])
async def admin_orders(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[list[OrderRead]]:
    service = OrderService(db)
    data = [service.build_order_read(order) for order in service.list_orders()]
    return ApiResponse(message="获取成功", data=data)


@router.get("/cdks", response_model=ApiResponse[list[CdkRead]])
async def admin_cdks(
    _: dict = Depends(admin_auth),
    goods_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ApiResponse[list[CdkRead]]:
    data = [CdkRead.model_validate(card) for card in CdkService(db).list_cards(goods_id=goods_id, status=status)]
    return ApiResponse(message="获取成功", data=data)


@router.post("/cdks/import", response_model=ApiResponse[dict])
async def import_cdks(payload: CdkImportRequest, _: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[dict]:
    result = CdkService(db).import_cards(payload)
    return ApiResponse(message="导入成功", data=result)


@router.post("/cdks/batch-status", response_model=ApiResponse[dict])
async def batch_update_cdks(
    payload: CdkBatchStatusRequest,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    try:
        result = CdkService(db).batch_update_status(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="操作成功", data=result)


@router.get("/configs", response_model=ApiResponse[list[ConfigItem]])
async def admin_configs(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[list[ConfigItem]]:
    service = ConfigService(db)
    data = [
        ConfigItem(
            config_key=item.config_key,
            config_value=service.deserialize(item.config_value, item.config_type),
            config_type=item.config_type,
            group_name=item.group_name,
            description=item.description,
            is_sensitive=item.is_sensitive,
        )
        for item in service.list_all()
    ]
    return ApiResponse(message="获取成功", data=data)


@router.put("/configs/{config_key}", response_model=ApiResponse[ConfigItem])
async def update_config(
    config_key: str,
    payload: ConfigUpdateRequest,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[ConfigItem]:
    service = ConfigService(db)
    try:
        entry = service.set(config_key, payload.value)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    item = ConfigItem(
        config_key=entry.config_key,
        config_value=service.deserialize(entry.config_value, entry.config_type),
        config_type=entry.config_type,
        group_name=entry.group_name,
        description=entry.description,
        is_sensitive=entry.is_sensitive,
    )
    return ApiResponse(message="更新成功", data=item)


@router.post("/cache/configs/clear", response_model=ApiResponse[dict])
async def clear_config_cache(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[dict]:
    cleared = ConfigService(db).clear_all_cache()
    return ApiResponse(message="配置缓存已清除", data={"cleared": cleared})


@router.post("/cache/goods/clear", response_model=ApiResponse[dict])
async def clear_goods_cache(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[dict]:
    cleared = GoodsService(db).clear_public_cache()
    return ApiResponse(message="商品缓存已清除", data={"cleared": cleared})


@router.get("/agents", response_model=ApiResponse[list[AgentAccountRead]])
async def admin_agents(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[list[AgentAccountRead]]:
    accounts = [
        AgentAccountRead(
            agent_code=item.get("agent_code", ""),
            agent_name=item.get("agent_name", ""),
            username=item.get("username", ""),
            status=int(item.get("status", 1)),
            allowed_goods_ids=item.get("allowed_goods_ids", []),
        )
        for item in ConfigService(db).get_agent_accounts()
    ]
    return ApiResponse(message="获取成功", data=accounts)


@router.post("/agents", response_model=ApiResponse[AgentAccountRead])
async def create_agent(
    payload: AgentAccountUpsert,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[AgentAccountRead]:
    try:
        item = ConfigService(db).save_agent_account(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="创建成功", data=AgentAccountRead(**item))


@router.put("/agents/{agent_code}", response_model=ApiResponse[AgentAccountRead])
async def update_agent(
    agent_code: str,
    payload: AgentAccountUpsert,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[AgentAccountRead]:
    try:
        item = ConfigService(db).save_agent_account(payload, original_agent_code=agent_code)
    except ValueError as exc:
        status_code = 404 if str(exc) == "代理不存在" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return ApiResponse(message="更新成功", data=AgentAccountRead(**item))


@router.get("/channels", response_model=ApiResponse[list[ChannelRead]])
async def admin_channels(_: dict = Depends(admin_auth), db: Session = Depends(get_db)) -> ApiResponse[list[ChannelRead]]:
    service = SourceService(db)
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    goods_rows = GoodsService(db).list_goods()
    fallback_goods_id = goods_rows[0].id if goods_rows else None
    data = [service.build_channel_read(item, site_url, fallback_goods_id) for item in service.list_channels()]
    return ApiResponse(message="获取成功", data=data)


@router.post("/channels", response_model=ApiResponse[ChannelRead])
async def create_channel(
    payload: ChannelUpsert,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[ChannelRead]:
    service = SourceService(db)
    try:
        item = service.save_channel(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    return ApiResponse(message="创建成功", data=service.build_channel_read(item, site_url, payload.goods_id))


@router.post("/channels/batch", response_model=ApiResponse[dict])
async def create_channels_batch(
    payload: ChannelBatchCreateRequest,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    service = SourceService(db)
    try:
        result = service.bulk_create_channels(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiResponse(message="批量创建完成", data=result)


@router.put("/channels/{agent_code}/{channel_code}", response_model=ApiResponse[ChannelRead])
async def update_channel(
    agent_code: str,
    channel_code: str,
    payload: ChannelUpsert,
    _: dict = Depends(admin_auth),
    db: Session = Depends(get_db),
) -> ApiResponse[ChannelRead]:
    service = SourceService(db)
    try:
        item = service.save_channel(payload, original_agent_code=agent_code, original_channel_code=channel_code)
    except ValueError as exc:
        status_code = 404 if str(exc) == "来源渠道不存在" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    site_url = ConfigService(db).get("SITE_URL", "").rstrip("/")
    return ApiResponse(message="更新成功", data=service.build_channel_read(item, site_url, payload.goods_id))
