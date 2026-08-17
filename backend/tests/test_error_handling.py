"""Regression tests for app.main's global exception handler (10.13 hardening).

The default `async_client` fixture uses httpx's ASGITransport with its default
`raise_app_exceptions=True`, which re-raises unhandled exceptions in the test process
instead of letting the app turn them into a response -- exactly what we need everywhere
else (an unhandled exception during a test is a real bug, it should fail loudly). Here we
need the opposite: a client that lets `app.main.unhandled_exception_handler` actually run,
so we build one locally with `raise_app_exceptions=False`.
"""

from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.db import get_db
from app.core.redis import get_redis
from app.features.auth.service import AuthService
from app.main import app
from tests.conftest import FakeRedis


@pytest_asyncio.fixture
async def client_allowing_app_exceptions(async_client: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    # Reuse async_client's already-configured dependency overrides (in-memory DB, fake redis);
    # only the transport's exception behavior differs.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_unhandled_exception_returns_a_generic_500_without_leaking_details(
    client_allowing_app_exceptions: AsyncClient, monkeypatch
) -> None:
    async def _boom(self: AuthService, email: str, password: str) -> None:
        raise RuntimeError("some internal detail that must never reach the client")

    monkeypatch.setattr(AuthService, "login", _boom)

    response = await client_allowing_app_exceptions.post(
        "/auth/login", json={"email": "someone@example.com", "password": "whatever"}
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "some internal detail" not in response.text


async def test_unhandled_exception_response_still_carries_cors_headers_for_an_allowed_origin(
    client_allowing_app_exceptions: AsyncClient, monkeypatch
) -> None:
    async def _boom(self: AuthService, email: str, password: str) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(AuthService, "login", _boom)

    response = await client_allowing_app_exceptions.post(
        "/auth/login",
        json={"email": "someone@example.com", "password": "whatever"},
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
