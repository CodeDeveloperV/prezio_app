from datetime import datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.features.promotions.enums import PromotionStatus, PromotionType
from app.features.promotions.models import Promotion
from app.features.promotions.resolver import compute_effective_price, derive_display_status, select_effective_promotion
from tests.test_b2b_catalog import _admin, add_listing, add_product
from tests.test_organization_branches import add_branch, grant_branch_access
from tests.test_organizations import add_membership, auth, register_and_login, seed_store

PROMOTIONS_URL = "/b2b/organizations/{store_id}/promotions"

NOW = datetime.now(timezone.utc)
PAST_START = NOW - timedelta(days=10)
PAST_END = NOW - timedelta(days=1)
FUTURE_START = NOW + timedelta(days=1)
FUTURE_END = NOW + timedelta(days=10)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def special_price_payload(
    *,
    special_price: str = "1.00",
    start_at: datetime = PAST_START,
    end_at: datetime = FUTURE_END,
    branch_ids: list[int] | None = None,
    product_ids: list[int] | None = None,
    name: str = "Promo especial",
) -> dict:
    return {
        "name": name,
        "type": PromotionType.SPECIAL_PRICE.value,
        "special_price": special_price,
        "start_at": _iso(start_at),
        "end_at": _iso(end_at),
        "branch_ids": branch_ids or [],
        "product_ids": product_ids or [],
    }


async def create_promotion(async_client: AsyncClient, store_id: int, token: str, payload: dict):
    return await async_client.post(PROMOTIONS_URL.format(store_id=store_id), json=payload, headers=auth(token))


# ---------------------------------------------------------------------------
# Per-type value validation
# ---------------------------------------------------------------------------


async def test_admin_creates_draft_special_price_promotion(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_promotion(async_client, store_id, admin_token, special_price_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["display_status"] == "draft"
    assert body["special_price"] == "1.00"


async def test_percentage_discount_must_be_within_0_and_100(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    base = special_price_payload()
    del base["special_price"]

    for invalid_value in ("0", "-5", "101", "150"):
        payload = {**base, "type": PromotionType.PERCENTAGE_DISCOUNT.value, "percentage_value": invalid_value}
        response = await create_promotion(async_client, store_id, admin_token, payload)
        assert response.status_code == 422, invalid_value


async def test_percentage_discount_accepts_valid_boundary_values(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    base = special_price_payload()
    del base["special_price"]

    for valid_value in ("0.01", "50", "100"):
        payload = {**base, "type": PromotionType.PERCENTAGE_DISCOUNT.value, "percentage_value": valid_value}
        response = await create_promotion(async_client, store_id, admin_token, payload)
        assert response.status_code == 201, valid_value


async def test_fixed_discount_must_be_greater_than_zero(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    base = special_price_payload()
    del base["special_price"]

    for invalid_value in ("0", "-1"):
        payload = {**base, "type": PromotionType.FIXED_DISCOUNT.value, "fixed_discount_value": invalid_value}
        response = await create_promotion(async_client, store_id, admin_token, payload)
        assert response.status_code == 422, invalid_value


async def test_special_price_must_not_be_negative(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_promotion(async_client, store_id, admin_token, special_price_payload(special_price="-0.01"))

    assert response.status_code == 422


async def test_special_price_zero_is_allowed(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_promotion(async_client, store_id, admin_token, special_price_payload(special_price="0"))

    assert response.status_code == 201


async def test_buy_x_get_y_requires_buy_quantity_greater_than_pay_quantity(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    base = special_price_payload()
    del base["special_price"]

    invalid = {**base, "type": PromotionType.BUY_X_GET_Y.value, "buy_quantity": 2, "pay_quantity": 2}
    response = await create_promotion(async_client, store_id, admin_token, invalid)
    assert response.status_code == 422

    valid = {**base, "type": PromotionType.BUY_X_GET_Y.value, "buy_quantity": 3, "pay_quantity": 2}
    response = await create_promotion(async_client, store_id, admin_token, valid)
    assert response.status_code == 201


async def test_buy_x_get_y_pay_quantity_must_be_at_least_one(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    base = special_price_payload()
    del base["special_price"]

    payload = {**base, "type": PromotionType.BUY_X_GET_Y.value, "buy_quantity": 2, "pay_quantity": 0}
    response = await create_promotion(async_client, store_id, admin_token, payload)
    assert response.status_code == 422


async def test_cannot_set_a_value_field_from_a_different_type(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    payload = special_price_payload()
    payload["percentage_value"] = "10"  # type is still SPECIAL_PRICE

    response = await create_promotion(async_client, store_id, admin_token, payload)

    assert response.status_code == 422


async def test_start_at_must_be_before_end_at(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    payload = special_price_payload(start_at=FUTURE_END, end_at=FUTURE_START)

    response = await create_promotion(async_client, store_id, admin_token, payload)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Permissions and branch scoping
# ---------------------------------------------------------------------------


async def test_employee_is_strictly_read_only(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    )
    promotion_id = create_response.json()["id"]

    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    employee_member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, employee_member_id, branch_id)
    headers = auth(employee_token)

    assert (await create_promotion(async_client, store_id, employee_token, special_price_payload())).status_code == 403
    assert (
        await async_client.patch(
            f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}",
            json=special_price_payload(),
            headers=headers,
        )
    ).status_code == 403
    assert (
        await async_client.post(
            f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=headers
        )
    ).status_code == 403
    assert (
        await async_client.post(
            f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/cancel", headers=headers
        )
    ).status_code == 403
    assert (
        await async_client.delete(f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}", headers=headers)
    ).status_code == 403

    # But listing/detail are readable.
    assert (await async_client.get(PROMOTIONS_URL.format(store_id=store_id), headers=headers)).status_code == 200
    assert (
        await async_client.get(f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}", headers=headers)
    ).status_code == 200


async def test_manager_can_create_within_own_branch_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await create_promotion(
        async_client, store_id, manager_token, special_price_payload(branch_ids=[branch_id])
    )

    assert response.status_code == 201


async def test_manager_cannot_create_covering_a_branch_outside_their_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await create_promotion(
        async_client, store_id, manager_token, special_price_payload(branch_ids=[other_branch_id])
    )

    assert response.status_code == 403


async def test_manager_cannot_modify_a_promotion_spanning_a_branch_outside_their_scope(
    async_client: AsyncClient,
) -> None:
    """Critical branch-scoping rule: a MANAGER must be authorized over EVERY branch a
    promotion covers, never just some of them, to modify/publish/cancel it."""
    store_id, branch_a = await seed_store(async_client)
    branch_b = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_a, branch_b])
    )
    promotion_id = create_response.json()["id"]

    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_a)  # only branch_a, not branch_b

    response = await async_client.patch(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}",
        json=special_price_payload(branch_ids=[branch_a, branch_b]),
        headers=auth(manager_token),
    )

    assert response.status_code == 403


async def test_admin_operates_across_every_branch_of_the_organization(async_client: AsyncClient) -> None:
    store_id, branch_a = await seed_store(async_client)
    branch_b = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    admin_token = await _admin(async_client, store_id)

    response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_a, branch_b])
    )

    assert response.status_code == 201
    assert set(response.json()["branch_ids"]) == {branch_a, branch_b}


# ---------------------------------------------------------------------------
# Publish / cancel / edit / delete lifecycle
# ---------------------------------------------------------------------------


async def test_publish_requires_at_least_one_branch(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    product_id = await add_product(async_client)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(product_ids=[product_id])
    )
    promotion_id = create_response.json()["id"]

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 422


async def test_publish_requires_at_least_one_product(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id])
    )
    promotion_id = create_response.json()["id"]

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 422


async def test_publish_requires_an_active_listing_at_every_selected_branch(async_client: AsyncClient) -> None:
    store_id, branch_a = await seed_store(async_client)
    branch_b = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_a, product_id, status="active")
    # No listing at branch_b at all.
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client,
        store_id,
        admin_token,
        special_price_payload(branch_ids=[branch_a, branch_b], product_ids=[product_id]),
    )
    promotion_id = create_response.json()["id"]

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 422


async def test_publish_succeeds_and_sets_audit_fields(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    )
    promotion_id = create_response.json()["id"]

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "published"
    assert body["published_at"] is not None
    assert body["published_by"] is not None


async def test_cannot_publish_a_non_draft_promotion(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    )
    promotion_id = create_response.json()["id"]
    await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 409


async def test_cancel_transitions_published_to_cancelled_with_audit_fields(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    )
    promotion_id = create_response.json()["id"]
    await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/cancel", headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["display_status"] == "cancelled"
    assert body["cancelled_at"] is not None
    assert body["cancelled_by"] is not None


async def test_cannot_cancel_a_non_published_promotion(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(async_client, store_id, admin_token, special_price_payload())
    promotion_id = create_response.json()["id"]

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/cancel", headers=auth(admin_token)
    )

    assert response.status_code == 409


async def test_only_a_draft_promotion_can_be_edited(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    )
    promotion_id = create_response.json()["id"]
    await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    response = await async_client.patch(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}",
        json=special_price_payload(special_price="2.00"),
        headers=auth(admin_token),
    )

    assert response.status_code == 409


async def test_delete_only_allowed_for_an_unused_draft(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    admin_token = await _admin(async_client, store_id)

    unused = await create_promotion(async_client, store_id, admin_token, special_price_payload())
    used = await create_promotion(
        async_client, store_id, admin_token, special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    )

    unused_delete = await async_client.delete(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{unused.json()['id']}", headers=auth(admin_token)
    )
    used_delete = await async_client.delete(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{used.json()['id']}", headers=auth(admin_token)
    )

    assert unused_delete.status_code == 204
    assert used_delete.status_code == 409


# ---------------------------------------------------------------------------
# Listing filters / pagination
# ---------------------------------------------------------------------------


async def test_list_filters_by_status_type_branch_and_product(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    admin_token = await _admin(async_client, store_id)

    await create_promotion(
        async_client, store_id, admin_token, special_price_payload(name="A", branch_ids=[branch_id], product_ids=[product_id])
    )
    await create_promotion(
        async_client,
        store_id,
        admin_token,
        special_price_payload(name="B", branch_ids=[other_branch_id], product_ids=[product_id]),
    )

    by_branch = await async_client.get(
        PROMOTIONS_URL.format(store_id=store_id), params={"branch_id": branch_id}, headers=auth(admin_token)
    )
    by_type = await async_client.get(
        PROMOTIONS_URL.format(store_id=store_id),
        params={"type": PromotionType.SPECIAL_PRICE.value},
        headers=auth(admin_token),
    )
    by_status = await async_client.get(
        PROMOTIONS_URL.format(store_id=store_id),
        params={"status_filter": PromotionStatus.DRAFT.value},
        headers=auth(admin_token),
    )

    assert by_branch.status_code == 200
    assert [p["name"] for p in by_branch.json()["items"]] == ["A"]
    assert by_type.status_code == 200
    assert len(by_type.json()["items"]) == 2
    assert by_status.status_code == 200
    assert len(by_status.json()["items"]) == 2


async def test_list_is_paginated(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    for i in range(3):
        await create_promotion(async_client, store_id, admin_token, special_price_payload(name=f"Promo {i}"))

    response = await async_client.get(
        PROMOTIONS_URL.format(store_id=store_id), params={"page": 1, "page_size": 2}, headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["page_size"] == 2


async def test_manager_listing_is_scoped_to_their_accessible_branches(async_client: AsyncClient) -> None:
    store_id, branch_a = await seed_store(async_client)
    branch_b = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    admin_token = await _admin(async_client, store_id)
    await create_promotion(async_client, store_id, admin_token, special_price_payload(name="A", branch_ids=[branch_a]))
    await create_promotion(async_client, store_id, admin_token, special_price_payload(name="B", branch_ids=[branch_b]))

    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_a)

    response = await async_client.get(PROMOTIONS_URL.format(store_id=store_id), headers=auth(manager_token))

    assert response.status_code == 200
    assert [p["name"] for p in response.json()["items"]] == ["A"]


# ---------------------------------------------------------------------------
# display_status derivation
# ---------------------------------------------------------------------------


async def test_display_status_scheduled_active_and_expired(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)

    scheduled = await create_promotion(
        async_client,
        store_id,
        admin_token,
        special_price_payload(name="scheduled", start_at=FUTURE_START, end_at=FUTURE_END, branch_ids=[branch_id], product_ids=[product_id]),
    )
    active = await create_promotion(
        async_client,
        store_id,
        admin_token,
        special_price_payload(name="active", start_at=PAST_START, end_at=FUTURE_END, branch_ids=[branch_id], product_ids=[product_id]),
    )
    expired = await create_promotion(
        async_client,
        store_id,
        admin_token,
        special_price_payload(name="expired", start_at=PAST_START, end_at=PAST_END, branch_ids=[branch_id], product_ids=[product_id]),
    )

    for creation in (scheduled, active, expired):
        promo_id = creation.json()["id"]
        publish = await async_client.post(
            f"{PROMOTIONS_URL.format(store_id=store_id)}/{promo_id}/publish", headers=auth(admin_token)
        )
        assert publish.status_code == 200

    scheduled_detail = await async_client.get(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{scheduled.json()['id']}", headers=auth(admin_token)
    )
    active_detail = await async_client.get(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{active.json()['id']}", headers=auth(admin_token)
    )
    expired_detail = await async_client.get(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{expired.json()['id']}", headers=auth(admin_token)
    )

    assert scheduled_detail.json()["display_status"] == "scheduled"
    assert active_detail.json()["display_status"] == "active"
    assert expired_detail.json()["display_status"] == "expired"


# ---------------------------------------------------------------------------
# Promotions never touch StoreProduct.current_price / PriceHistory
# ---------------------------------------------------------------------------


async def test_publishing_a_promotion_never_touches_store_product_price_or_history(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50", status="active")
    admin_token = await _admin(async_client, store_id)
    create_response = await create_promotion(
        async_client,
        store_id,
        admin_token,
        special_price_payload(special_price="0.99", branch_ids=[branch_id], product_ids=[product_id]),
    )
    promotion_id = create_response.json()["id"]

    response = await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )
    assert response.status_code == 200

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.pricing.models import PriceHistory, StoreProduct

    async with session_factory() as session:
        listing = await session.get(StoreProduct, listing_id)
        assert listing is not None
        assert listing.current_price == Decimal("1.50")  # untouched by the promotion
        history = (
            await session.execute(select(PriceHistory).where(PriceHistory.store_product_id == listing_id))
        ).scalars().all()
        assert list(history) == []


# ---------------------------------------------------------------------------
# Resolver: overlap resolution, effective price, and get_effective_promotion
# ---------------------------------------------------------------------------


def _build_promotion(
    *,
    id: int,
    type: PromotionType,
    priority: int,
    status: PromotionStatus = PromotionStatus.PUBLISHED,
    start_at: datetime = PAST_START,
    end_at: datetime = FUTURE_END,
    percentage_value: Decimal | None = None,
    fixed_discount_value: Decimal | None = None,
    special_price: Decimal | None = None,
    buy_quantity: int | None = None,
    pay_quantity: int | None = None,
) -> Promotion:
    return Promotion(
        id=id,
        store_id=1,
        name=f"promo-{id}",
        type=type,
        status=status,
        priority=priority,
        start_at=start_at,
        end_at=end_at,
        percentage_value=percentage_value,
        fixed_discount_value=fixed_discount_value,
        special_price=special_price,
        buy_quantity=buy_quantity,
        pay_quantity=pay_quantity,
    )


def test_select_effective_promotion_picks_lower_priority_number() -> None:
    higher_priority = _build_promotion(id=1, type=PromotionType.SPECIAL_PRICE, priority=0, special_price=Decimal("1"))
    lower_priority = _build_promotion(id=2, type=PromotionType.FIXED_DISCOUNT, priority=5, fixed_discount_value=Decimal("1"))

    chosen = select_effective_promotion([lower_priority, higher_priority], now=NOW)

    assert chosen is higher_priority


def test_select_effective_promotion_breaks_priority_ties_by_id() -> None:
    older = _build_promotion(id=1, type=PromotionType.SPECIAL_PRICE, priority=1, special_price=Decimal("1"))
    newer = _build_promotion(id=2, type=PromotionType.SPECIAL_PRICE, priority=1, special_price=Decimal("2"))

    chosen = select_effective_promotion([newer, older], now=NOW)

    assert chosen is older


def test_select_effective_promotion_ignores_inactive_candidates() -> None:
    draft = _build_promotion(id=1, type=PromotionType.SPECIAL_PRICE, priority=0, status=PromotionStatus.DRAFT, special_price=Decimal("1"))
    expired = _build_promotion(
        id=2, type=PromotionType.SPECIAL_PRICE, priority=0, start_at=PAST_START, end_at=PAST_END, special_price=Decimal("1")
    )
    active = _build_promotion(id=3, type=PromotionType.SPECIAL_PRICE, priority=2, special_price=Decimal("1"))

    chosen = select_effective_promotion([draft, expired, active], now=NOW)

    assert chosen is active


def test_compute_effective_price_never_negative() -> None:
    percentage_100 = _build_promotion(id=1, type=PromotionType.PERCENTAGE_DISCOUNT, priority=0, percentage_value=Decimal("100"))
    huge_fixed_discount = _build_promotion(id=2, type=PromotionType.FIXED_DISCOUNT, priority=0, fixed_discount_value=Decimal("999"))

    assert compute_effective_price(percentage_100, Decimal("10.00")) == Decimal("0")
    assert compute_effective_price(huge_fixed_discount, Decimal("10.00")) == Decimal("0")


def test_compute_effective_price_percentage_and_fixed_discount() -> None:
    percentage = _build_promotion(id=1, type=PromotionType.PERCENTAGE_DISCOUNT, priority=0, percentage_value=Decimal("20"))
    fixed = _build_promotion(id=2, type=PromotionType.FIXED_DISCOUNT, priority=0, fixed_discount_value=Decimal("1.00"))

    assert compute_effective_price(percentage, Decimal("10.00")) == Decimal("8.00")
    assert compute_effective_price(fixed, Decimal("10.00")) == Decimal("9.00")


def test_derive_display_status_for_draft_and_cancelled() -> None:
    draft = _build_promotion(id=1, type=PromotionType.SPECIAL_PRICE, priority=0, status=PromotionStatus.DRAFT, special_price=Decimal("1"))
    cancelled = _build_promotion(
        id=2, type=PromotionType.SPECIAL_PRICE, priority=0, status=PromotionStatus.CANCELLED, special_price=Decimal("1")
    )

    assert derive_display_status(draft, now=NOW).value == "draft"
    assert derive_display_status(cancelled, now=NOW).value == "cancelled"


async def test_get_effective_promotion_returns_quantity_metadata_for_buy_x_get_y(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    admin_token = await _admin(async_client, store_id)
    base = special_price_payload(branch_ids=[branch_id], product_ids=[product_id])
    del base["special_price"]
    payload = {**base, "type": PromotionType.BUY_X_GET_Y.value, "buy_quantity": 3, "pay_quantity": 2}
    create_response = await create_promotion(async_client, store_id, admin_token, payload)
    promotion_id = create_response.json()["id"]
    await async_client.post(
        f"{PROMOTIONS_URL.format(store_id=store_id)}/{promotion_id}/publish", headers=auth(admin_token)
    )

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.catalog.repository import ProductRepository
    from app.features.organizations.repository import OrganizationMemberBranchRepository, OrganizationMemberRepository
    from app.features.organizations.service import OrganizationMembershipService
    from app.features.pricing.repository import StoreProductRepository
    from app.features.promotions.repository import (
        PromotionBranchRepository,
        PromotionProductRepository,
        PromotionRepository,
    )
    from app.features.promotions.service import PromotionService
    from app.features.stores.repository import StoreBranchRepository, StoreRepository
    from app.features.users.repository import UserRepository

    async with session_factory() as session:
        service = PromotionService(
            session,
            PromotionRepository(session),
            PromotionBranchRepository(session),
            PromotionProductRepository(session),
            OrganizationMembershipService(
                session,
                OrganizationMemberRepository(session),
                OrganizationMemberBranchRepository(session),
                UserRepository(session),
                StoreRepository(session),
                StoreBranchRepository(session),
            ),
            ProductRepository(session),
            StoreProductRepository(session),
        )
        result = await service.get_effective_promotion(store_id, branch_id, product_id, Decimal("10.00"))

    assert result is not None
    assert result.type == PromotionType.BUY_X_GET_Y
    assert result.effective_unit_price is None
    assert result.buy_quantity == 3
    assert result.pay_quantity == 2


async def test_get_effective_promotion_returns_none_without_active_promotions(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.catalog.repository import ProductRepository
    from app.features.organizations.repository import OrganizationMemberBranchRepository, OrganizationMemberRepository
    from app.features.organizations.service import OrganizationMembershipService
    from app.features.pricing.repository import StoreProductRepository
    from app.features.promotions.repository import (
        PromotionBranchRepository,
        PromotionProductRepository,
        PromotionRepository,
    )
    from app.features.promotions.service import PromotionService
    from app.features.stores.repository import StoreBranchRepository, StoreRepository
    from app.features.users.repository import UserRepository

    async with session_factory() as session:
        service = PromotionService(
            session,
            PromotionRepository(session),
            PromotionBranchRepository(session),
            PromotionProductRepository(session),
            OrganizationMembershipService(
                session,
                OrganizationMemberRepository(session),
                OrganizationMemberBranchRepository(session),
                UserRepository(session),
                StoreRepository(session),
                StoreBranchRepository(session),
            ),
            ProductRepository(session),
            StoreProductRepository(session),
        )
        result = await service.get_effective_promotion(store_id, branch_id, product_id, Decimal("10.00"))

    assert result is None


# --- multi-tenant isolation: a promotion belonging to org B must never be reachable through org A's URL space ---


async def test_branch_belonging_to_a_different_organization_is_rejected(async_client: AsyncClient) -> None:
    """`branch_ids` is an array param the client fully controls -- creating a promotion must
    authorize every branch_id against the caller's own org, not just accept whatever IDs
    arrive in the payload (mirrors the equivalent coupons test)."""
    store_a_id, _ = await seed_store(async_client, "Super A")
    _, other_branch_id = await seed_store(async_client, "Super B")
    admin_a_token = await _admin(async_client, store_a_id, "admin-a-branch-idor@example.com")

    response = await create_promotion(
        async_client, store_a_id, admin_a_token, special_price_payload(branch_ids=[other_branch_id])
    )

    assert response.status_code == 400


async def test_organization_a_cannot_reach_organization_bs_promotion(async_client: AsyncClient) -> None:
    store_a, _ = await seed_store(async_client, "Super A")
    store_b, branch_b = await seed_store(async_client, "Super B")
    admin_a_token = await _admin(async_client, store_a, "admin-a@example.com")
    admin_b_token = await _admin(async_client, store_b, "admin-b@example.com")
    product_id = await add_product(async_client)

    created = await create_promotion(
        async_client, store_b, admin_b_token, special_price_payload(branch_ids=[branch_b], product_ids=[product_id])
    )
    promotion_id = created.json()["id"]
    url_in_a = f"{PROMOTIONS_URL.format(store_id=store_a)}/{promotion_id}"

    update_payload = special_price_payload(branch_ids=[branch_b], product_ids=[product_id], name="Hijacked")
    get_response = await async_client.get(url_in_a, headers=auth(admin_a_token))
    update_response = await async_client.patch(url_in_a, json=update_payload, headers=auth(admin_a_token))
    publish_response = await async_client.post(f"{url_in_a}/publish", headers=auth(admin_a_token))
    cancel_response = await async_client.post(f"{url_in_a}/cancel", headers=auth(admin_a_token))
    delete_response = await async_client.delete(url_in_a, headers=auth(admin_a_token))

    for response in (get_response, update_response, publish_response, cancel_response, delete_response):
        assert response.status_code == 404, response.request.method
