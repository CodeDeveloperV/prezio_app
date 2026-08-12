from httpx import AsyncClient

REGISTER_PAYLOAD = {"email": "alice@example.com", "password": "s3cret123"}


async def register_and_login(client: AsyncClient) -> dict:
    await client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = await client.post(
        "/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]},
    )
    return response.json()


async def test_register_creates_user(async_client: AsyncClient) -> None:
    response = await async_client.post("/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == REGISTER_PAYLOAD["email"]
    assert body["is_active"] is True
    assert "id" in body


async def test_register_duplicate_email_conflicts(async_client: AsyncClient) -> None:
    await async_client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = await async_client.post("/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 409


async def test_login_with_correct_password_succeeds(async_client: AsyncClient) -> None:
    await async_client.post("/auth/register", json=REGISTER_PAYLOAD)

    response = await async_client.post(
        "/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


async def test_login_with_incorrect_password_fails(async_client: AsyncClient) -> None:
    await async_client.post("/auth/register", json=REGISTER_PAYLOAD)

    response = await async_client.post(
        "/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": "wrong-password"},
    )

    assert response.status_code == 401


async def test_login_with_unknown_email_fails(async_client: AsyncClient) -> None:
    response = await async_client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "whatever123"}
    )

    assert response.status_code == 401


async def test_protected_endpoint_requires_access_token(async_client: AsyncClient) -> None:
    response = await async_client.get("/users/me")

    assert response.status_code == 403  # no Authorization header at all


async def test_protected_endpoint_accepts_valid_access_token(async_client: AsyncClient) -> None:
    tokens = await register_and_login(async_client)

    response = await async_client.get(
        "/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == REGISTER_PAYLOAD["email"]


async def test_refresh_issues_new_tokens(async_client: AsyncClient) -> None:
    tokens = await register_and_login(async_client)

    response = await async_client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert response.status_code == 200
    new_tokens = response.json()
    assert new_tokens["access_token"]
    assert new_tokens["refresh_token"] != tokens["refresh_token"]  # rotated


async def test_refresh_rejects_already_rotated_token(async_client: AsyncClient) -> None:
    tokens = await register_and_login(async_client)

    first_refresh = await async_client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert first_refresh.status_code == 200

    # Reusing the original (now-revoked) refresh token must fail.
    second_refresh = await async_client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert second_refresh.status_code == 401


async def test_logout_revokes_session_so_protected_endpoint_rejects_old_access_token(
    async_client: AsyncClient,
) -> None:
    tokens = await register_and_login(async_client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    # Access token works before logout.
    before_logout = await async_client.get("/users/me", headers=headers)
    assert before_logout.status_code == 200

    logout_response = await async_client.post(
        "/auth/logout", json={"refresh_token": tokens["refresh_token"]}
    )
    assert logout_response.status_code == 204

    # Same (still unexpired) access token must now be rejected: the access token is
    # bound to its session row (`sid` claim), so revoking the session invalidates it
    # immediately instead of waiting out its natural expiry.
    after_logout = await async_client.get("/users/me", headers=headers)
    assert after_logout.status_code == 401

    # The refresh token is revoked too, so it can no longer mint new access tokens.
    refresh_after_logout = await async_client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh_after_logout.status_code == 401
