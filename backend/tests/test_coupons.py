from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from tests.test_b2b_catalog import _admin, add_listing, add_product
from tests.test_organization_branches import add_branch, grant_branch_access
from tests.test_organizations import add_membership, auth, register_and_login, seed_store

COUPONS_URL = "/b2b/organizations/{store_id}/coupons"

NOW = datetime.now(timezone.utc)
PAST_START = NOW - timedelta(days=10)
PAST_END = NOW - timedelta(days=1)
FUTURE_START = NOW + timedelta(days=1)
FUTURE_END = NOW + timedelta(days=10)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def coupon_payload(
    *,
    name: str = "Cupón de bienvenida",
    code: str = "WELCOME10",
    type: str = "percentage_discount",
    percentage_value: str | None = "10",
    fixed_amount_value: str | None = None,
    applies_to_entire_purchase: bool = True,
    applies_to_all_branches: bool = True,
    minimum_purchase_amount: str | None = None,
    maximum_discount_amount: str | None = None,
    max_redemptions_total: int | None = None,
    max_redemptions_per_user: int | None = None,
    is_stackable: bool = False,
    start_at: datetime = PAST_START,
    end_at: datetime = FUTURE_END,
    branch_ids: list[int] | None = None,
    product_ids: list[int] | None = None,
) -> dict:
    return {
        "name": name,
        "code": code,
        "type": type,
        "percentage_value": percentage_value,
        "fixed_amount_value": fixed_amount_value,
        "applies_to_entire_purchase": applies_to_entire_purchase,
        "applies_to_all_branches": applies_to_all_branches,
        "minimum_purchase_amount": minimum_purchase_amount,
        "maximum_discount_amount": maximum_discount_amount,
        "max_redemptions_total": max_redemptions_total,
        "max_redemptions_per_user": max_redemptions_per_user,
        "is_stackable": is_stackable,
        "start_at": _iso(start_at),
        "end_at": _iso(end_at),
        "branch_ids": branch_ids or [],
        "product_ids": product_ids or [],
    }


async def create_coupon(async_client: AsyncClient, store_id: int, token: str, payload: dict):
    return await async_client.post(COUPONS_URL.format(store_id=store_id), json=payload, headers=auth(token))


# --- creation / permissions -------------------------------------------------


async def test_admin_creates_draft_coupon(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(async_client, store_id, admin_token, coupon_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["display_status"] == "draft"
    assert body["code"] == "WELCOME10"


async def test_manager_cannot_create_coupon(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    await add_membership(async_client, store_id, manager_id, "manager")

    response = await create_coupon(async_client, store_id, manager_token, coupon_payload())

    assert response.status_code == 403


async def test_employee_cannot_create_coupon(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    await add_membership(async_client, store_id, employee_id, "employee")

    response = await create_coupon(async_client, store_id, employee_token, coupon_payload())

    assert response.status_code == 403


# --- visibility scoping ------------------------------------------------------


async def test_manager_can_read_coupon_within_branch_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(applies_to_all_branches=False, branch_ids=[branch_id])
    )
    coupon_id = created.json()["id"]

    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.get(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}", headers=auth(manager_token)
    )

    assert response.status_code == 200


async def test_manager_cannot_read_coupon_outside_branch_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(applies_to_all_branches=False, branch_ids=[branch_id])
    )
    coupon_id = created.json()["id"]

    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, other_branch_id)

    response = await async_client.get(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}", headers=auth(manager_token)
    )

    assert response.status_code == 404


# --- org isolation ------------------------------------------------------------


async def test_org_isolation_cannot_access_other_orgs_coupon(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, _ = await seed_store(async_client, "Rey")
    admin_a_token = await _admin(async_client, store_a_id, "admin-a@example.com")
    created = await create_coupon(async_client, store_a_id, admin_a_token, coupon_payload())
    coupon_id = created.json()["id"]

    admin_b_token = await _admin(async_client, store_b_id, "admin-b@example.com")

    response = await async_client.get(
        f"{COUPONS_URL.format(store_id=store_b_id)}/{coupon_id}", headers=auth(admin_b_token)
    )

    assert response.status_code == 404


# --- code uniqueness ----------------------------------------------------------


async def test_duplicate_code_within_same_org_fails(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await create_coupon(async_client, store_id, admin_token, coupon_payload(code="SAVE10"))

    response = await create_coupon(async_client, store_id, admin_token, coupon_payload(code="SAVE10", name="Otro"))

    assert response.status_code == 409


async def test_duplicate_code_within_same_org_is_case_insensitive(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await create_coupon(async_client, store_id, admin_token, coupon_payload(code="SAVE10"))

    response = await create_coupon(async_client, store_id, admin_token, coupon_payload(code="save10", name="Otro"))

    assert response.status_code == 409


async def test_same_code_across_different_orgs_succeeds(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, _ = await seed_store(async_client, "Rey")
    admin_a_token = await _admin(async_client, store_a_id, "admin-a@example.com")
    admin_b_token = await _admin(async_client, store_b_id, "admin-b@example.com")

    response_a = await create_coupon(async_client, store_a_id, admin_a_token, coupon_payload(code="SAVE10"))
    response_b = await create_coupon(async_client, store_b_id, admin_b_token, coupon_payload(code="SAVE10"))

    assert response_a.status_code == 201
    assert response_b.status_code == 201


async def test_code_search_is_case_insensitive(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await create_coupon(async_client, store_id, admin_token, coupon_payload(code="SAVE10"))

    response = await async_client.get(
        COUPONS_URL.format(store_id=store_id), params={"name": "save10"}, headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["code"] == "SAVE10"


# --- value validation ----------------------------------------------------------


async def test_percentage_discount_over_100_fails(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(percentage_value="101")
    )

    assert response.status_code == 422


async def test_fixed_amount_not_greater_than_zero_fails(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(
        async_client,
        store_id,
        admin_token,
        coupon_payload(type="fixed_amount", percentage_value=None, fixed_amount_value="0"),
    )

    assert response.status_code == 422


async def test_negative_minimum_purchase_amount_fails(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(minimum_purchase_amount="-1")
    )

    assert response.status_code == 422


async def test_max_redemptions_total_must_be_positive_when_set(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(max_redemptions_total=0)
    )

    assert response.status_code == 422


async def test_max_redemptions_per_user_must_be_positive_when_set(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(max_redemptions_per_user=0)
    )

    assert response.status_code == 422


async def test_end_at_before_start_at_fails(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    response = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(start_at=FUTURE_END, end_at=FUTURE_START)
    )

    assert response.status_code == 422


# --- publish validation ----------------------------------------------------------


async def test_publish_requires_at_least_one_branch_when_not_all_branches(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(applies_to_all_branches=False, branch_ids=[])
    )
    coupon_id = created.json()["id"]

    response = await async_client.post(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 422


async def test_publish_requires_at_least_one_product_when_not_entire_purchase(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(applies_to_entire_purchase=False, product_ids=[])
    )
    coupon_id = created.json()["id"]

    response = await async_client.post(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token)
    )

    assert response.status_code == 422


async def test_branch_belonging_to_different_org_fails(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, other_branch_id = await seed_store(async_client, "Rey")
    admin_a_token = await _admin(async_client, store_a_id, "admin-a@example.com")

    response = await create_coupon(
        async_client,
        store_a_id,
        admin_a_token,
        coupon_payload(applies_to_all_branches=False, branch_ids=[other_branch_id]),
    )

    assert response.status_code == 400


# --- lifecycle ----------------------------------------------------------


async def test_cancelling_makes_coupon_no_longer_active(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(async_client, store_id, admin_token, coupon_payload())
    coupon_id = created.json()["id"]
    await async_client.post(f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token))

    response = await async_client.post(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/cancel", headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["display_status"] == "cancelled"


async def test_expired_coupon_is_not_active(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(start_at=PAST_START, end_at=PAST_END)
    )
    coupon_id = created.json()["id"]
    publish_response = await async_client.post(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token)
    )

    assert publish_response.status_code == 200
    assert publish_response.json()["display_status"] == "expired"


async def test_future_coupon_is_scheduled(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(
        async_client, store_id, admin_token, coupon_payload(start_at=FUTURE_START, end_at=FUTURE_END)
    )
    coupon_id = created.json()["id"]
    publish_response = await async_client.post(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token)
    )

    assert publish_response.status_code == 200
    assert publish_response.json()["display_status"] == "scheduled"


async def test_published_coupon_cannot_be_hard_deleted(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    created = await create_coupon(async_client, store_id, admin_token, coupon_payload())
    coupon_id = created.json()["id"]
    await async_client.post(f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token))

    response = await async_client.delete(
        f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}", headers=auth(admin_token)
    )

    assert response.status_code == 409


# --- domain isolation from Pricing / Promotion ----------------------------------------------------------


async def test_coupon_never_modifies_store_product_current_price(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="5.00")
    admin_token = await _admin(async_client, store_id)

    created = await create_coupon(
        async_client,
        store_id,
        admin_token,
        coupon_payload(applies_to_entire_purchase=False, product_ids=[product_id]),
    )
    coupon_id = created.json()["id"]
    await async_client.post(f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token))

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from sqlalchemy import select

    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        listing = (
            await session.execute(select(StoreProduct).where(StoreProduct.id == listing_id))
        ).scalar_one()
        assert str(listing.current_price) == "5.00"


async def test_coupon_never_creates_price_history(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, price="5.00")
    admin_token = await _admin(async_client, store_id)

    created = await create_coupon(async_client, store_id, admin_token, coupon_payload())
    coupon_id = created.json()["id"]
    await async_client.post(f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token))

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from sqlalchemy import func, select

    from app.features.pricing.models import PriceHistory

    async with session_factory() as session:
        count = (await session.execute(select(func.count()).select_from(PriceHistory))).scalar_one()
        assert count == 0


async def test_coupon_never_creates_or_modifies_a_promotion(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)

    created = await create_coupon(async_client, store_id, admin_token, coupon_payload())
    coupon_id = created.json()["id"]
    await async_client.post(f"{COUPONS_URL.format(store_id=store_id)}/{coupon_id}/publish", headers=auth(admin_token))

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from sqlalchemy import func, select

    from app.features.promotions.models import Promotion

    async with session_factory() as session:
        count = (await session.execute(select(func.count()).select_from(Promotion))).scalar_one()
        assert count == 0
