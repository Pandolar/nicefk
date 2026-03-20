"""Minimal ePay client used for signed form creation and order query."""

from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.services.config_service import ConfigService


class EpayService:
    """Wrap common ePay request signing and verification logic."""

    payment_method_map = {
        "wechat": "wxpay",
        "wx": "wxpay",
        "wxpay": "wxpay",
        "alipay": "alipay",
        "ali": "alipay",
        "qq": "qqpay",
        "qqpay": "qqpay",
    }

    def __init__(self, session: Session) -> None:
        self.config = ConfigService(session)
        self.settings = get_settings()

    def _sign(self, payload: dict[str, Any], key: str) -> str:
        filtered = {k: str(v) for k, v in payload.items() if k not in {"sign", "sign_type"} and str(v) != ""}
        joined = "&".join(f"{k}={filtered[k]}" for k in sorted(filtered))
        return hashlib.md5(f"{joined}{key}".encode("utf-8")).hexdigest()

    @staticmethod
    def _normalize_gateway_url(raw_url: str, suffix: str) -> str:
        """Support both full endpoint URLs and bare ePay host URLs."""

        cleaned = raw_url.strip()
        if cleaned.endswith(".php"):
            return cleaned
        return f"{cleaned.rstrip('/')}/{suffix}"

    def _normalize_payment_method(self, payment_method: str) -> str:
        """Map common aliases to the ePay gateway field values."""

        normalized = self.payment_method_map.get(payment_method.lower())
        if not normalized:
            raise ValueError("暂不支持该支付方式")
        return normalized

    def normalize_payment_method(self, payment_method: str) -> str:
        """Public wrapper used by order creation to align aliases consistently."""

        return self._normalize_payment_method(payment_method)

    def _resolve_gateway_url(self, config_key: str, fallback_suffix: str) -> str:
        """Load one ePay endpoint and support a shared base gateway URL."""

        configured = self.config.get(config_key, "")
        if configured:
            return self._normalize_gateway_url(configured, fallback_suffix)
        base_url = self.config.get("PAY_EPAY_API_URL", "")
        if base_url:
            return self._normalize_gateway_url(base_url, fallback_suffix)
        raise ValueError("请先配置 ePay 网关地址")

    def build_payment_payload(
        self,
        order_no: str,
        amount: Decimal,
        product_name: str,
        payment_method: str,
        client_ip: str,
        device: str = "pc",
        param: str = "",
    ) -> dict[str, Any]:
        """Build a signed ePay HTML form payload for frontend submission."""

        pid = self.config.get("PAY_EPAY_PID", "")
        key = self.config.get("PAY_EPAY_KEY", "")
        notify_url = self.config.get("PAY_NOTIFY_URL", f"{self.settings.site_url}/api/payments/epay/notify")
        return_url = self.config.get("PAY_RETURN_URL", f"{self.settings.site_url}/payment-return")
        if not pid or not key:
            raise ValueError("请先在配置中填写 ePay 商户号和密钥")
        submit_url = self._resolve_gateway_url("PAY_EPAY_SUBMIT_URL", "submit.php")
        normalized_payment_method = self._normalize_payment_method(payment_method)
        payload = {
            "pid": pid,
            "type": normalized_payment_method,
            "out_trade_no": order_no,
            "name": product_name,
            "money": f"{amount:.2f}",
            "notify_url": notify_url,
            "return_url": return_url,
            "clientip": client_ip or "127.0.0.1",
            "device": device or "pc",
            "param": param,
        }
        payload["sign"] = self._sign(payload, key)
        payload["sign_type"] = "MD5"
        return {
            "submit_url": submit_url,
            "method": "POST",
            "fields": {k: str(v) for k, v in payload.items()},
        }

    def verify_callback(self, payload: dict[str, Any]) -> bool:
        """Verify the callback signature from ePay."""

        key = self.config.get("PAY_EPAY_KEY", "")
        sign = payload.get("sign")
        if not sign or not key:
            return False
        expected = self._sign(payload, key)
        return expected == sign

    def is_paid_callback(self, payload: dict[str, Any]) -> bool:
        """Return whether the callback indicates a successful payment."""

        return self.verify_callback(payload) and payload.get("trade_status") in {"TRADE_SUCCESS", "TRADE_FINISHED"}

    def query_order(self, order_no: str) -> dict[str, Any]:
        """Query order status from ePay for scheduled reconciliation."""

        pid = self.config.get("PAY_EPAY_PID", "")
        key = self.config.get("PAY_EPAY_KEY", "")
        if not pid or not key:
            raise ValueError("请先配置 ePay 查单地址")
        query_url = self._resolve_gateway_url("PAY_EPAY_QUERY_URL", "api.php")
        params = {"act": "order", "pid": pid, "key": key, "out_trade_no": order_no}
        response = httpx.get(
            query_url,
            params=params,
            timeout=self.settings.request_timeout_seconds,
        )
        response.raise_for_status()
        return response.json()
