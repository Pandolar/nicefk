import os

os.environ['NICEFK_TESTING'] = 'true'
os.environ['NICEFK_CACHE_BACKEND'] = 'memory'
os.environ['NICEFK_DATABASE_URL'] = 'sqlite:///./test_nicefk.db'
os.environ['NICEFK_SCHEDULER_ENABLED'] = 'false'

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.cache import MemoryCacheBackend, reset_cache
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.main import app
from backend.app.models import CdkCard, ConfigEntry, Goods, Order
from backend.app.services.config_service import ConfigService

TEST_ENGINE = create_engine(
    'sqlite://',
    connect_args={'check_same_thread': False},
    poolclass=StaticPool,
    future=True,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)
Base.metadata.create_all(bind=TEST_ENGINE)


async def override_get_db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def reset_state():
    reset_cache(MemoryCacheBackend())
    session = TestingSessionLocal()
    try:
        session.query(Order).delete()
        session.query(CdkCard).delete()
        session.query(Goods).delete()
        session.query(ConfigEntry).delete()
        session.commit()
        ConfigService(session).ensure_defaults()
    finally:
        session.close()
    yield


@pytest.fixture()
def db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as test_client:
        yield test_client
