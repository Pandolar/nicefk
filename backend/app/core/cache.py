"""Cache abstraction used by config caching, auth sessions and payment locks."""

from __future__ import annotations

import json
import time
from typing import Any, Optional

from redis import Redis

from backend.app.core.config import get_settings


class CacheBackend:
    """Small cache protocol implemented by Redis and an in-memory fallback."""

    def get(self, key: str) -> Any:
        raise NotImplementedError

    def set(self, key: str, value: Any, ex: Optional[int] = None, nx: bool = False) -> bool:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class MemoryCacheBackend(CacheBackend):
    """Simple in-memory cache used by unit tests."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, Optional[float]]] = {}

    def _expired(self, key: str) -> bool:
        payload = self._store.get(key)
        if not payload:
            return True
        _, expire_at = payload
        return expire_at is not None and expire_at < time.time()

    def get(self, key: str) -> Any:
        if self._expired(key):
            self._store.pop(key, None)
            return None
        return self._store[key][0]

    def set(self, key: str, value: Any, ex: Optional[int] = None, nx: bool = False) -> bool:
        if nx and not self._expired(key) and key in self._store:
            return False
        expire_at = time.time() + ex if ex else None
        self._store[key] = (value, expire_at)
        return True

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def exists(self, key: str) -> bool:
        return self.get(key) is not None


class RedisCacheBackend(CacheBackend):
    """Redis-backed cache for production usage."""

    def __init__(self, redis_url: str) -> None:
        self.client = Redis.from_url(redis_url, decode_responses=True)

    def get(self, key: str) -> Any:
        value = self.client.get(key)
        if value is None:
            return None
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value

    def set(self, key: str, value: Any, ex: Optional[int] = None, nx: bool = False) -> bool:
        payload = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list, tuple, bool, int, float)) else value
        result = self.client.set(key, payload, ex=ex, nx=nx)
        return bool(result)

    def delete(self, key: str) -> None:
        self.client.delete(key)

    def exists(self, key: str) -> bool:
        return bool(self.client.exists(key))


_cache_backend: CacheBackend | None = None


def get_cache() -> CacheBackend:
    """Return the configured cache backend.

    Redis is preferred in normal environments. When Redis is not available or the
    application runs in testing mode, the in-memory backend keeps the code simple.
    """

    global _cache_backend
    if _cache_backend is not None:
        return _cache_backend

    settings = get_settings()
    if settings.testing or settings.cache_backend == "memory":
        _cache_backend = MemoryCacheBackend()
        return _cache_backend

    try:
        redis_cache = RedisCacheBackend(settings.redis_url)
        redis_cache.client.ping()
        _cache_backend = redis_cache
    except Exception:
        _cache_backend = MemoryCacheBackend()
    return _cache_backend


def reset_cache(backend: CacheBackend | None = None) -> None:
    """Replace the global cache backend, mainly for tests."""

    global _cache_backend
    _cache_backend = backend
