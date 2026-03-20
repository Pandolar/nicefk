"""Payment callback APIs."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.services.order_service import OrderService


router = APIRouter(prefix="/api/payments", tags=["payments"])


async def _collect_payload(request: Request) -> dict[str, Any]:
    """Read callback fields from query string or form body."""

    payload = dict(request.query_params)
    if request.method == "POST":
        form = await request.form()
        payload.update({k: v for k, v in form.items()})
    return payload


@router.api_route("/epay/notify", methods=["GET", "POST"])
async def epay_notify(request: Request, db: Session = Depends(get_db)) -> PlainTextResponse:
    payload = await _collect_payload(request)
    result = OrderService(db).handle_epay_callback(payload)
    return PlainTextResponse(result)


@router.get("/epay/return")
async def epay_return(order_no: str | None = None) -> HTMLResponse:
    target = f"/payment-return?order_no={order_no or ''}"
    return HTMLResponse(f"<html><meta http-equiv='refresh' content='0; url={target}' /></html>")
