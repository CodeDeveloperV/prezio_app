from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from tests.test_b2b_catalog import add_listing, add_product, _admin
from tests.test_organization_branches import add_branch, grant_branch_access
from tests.test_organizations import add_membership, auth, register_and_login, seed_store


async def test_employee_can_update_price_in_assigned_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")

    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(employee_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_price"] == "1.95"
    assert body["version"] == 2


async def test_employee_cannot_update_price_outside_assigned_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, other_branch_id, product_id, price="1.50")

    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(employee_token),
    )

    assert response.status_code == 403


async def test_manager_respects_branch_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, other_branch_id, product_id, price="1.50")

    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(manager_token),
    )

    assert response.status_code == 403


async def test_admin_can_operate_all_branches_of_organization(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, other_branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )

    assert response.status_code == 200


async def test_user_of_organization_a_cannot_modify_store_product_of_organization_b(
    async_client: AsyncClient,
) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, branch_b_id = await seed_store(async_client, "Riba Smith")
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_b_id, product_id, price="1.50")
    admin_a_token = await _admin(async_client, store_a_id, "admin-a@example.com")

    response = await async_client.patch(
        f"/b2b/organizations/{store_a_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_a_token),
    )

    assert response.status_code == 400


async def test_matching_version_updates_and_increments_version(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_price"] == "1.95"
    assert body["version"] == 2


async def test_stale_version_returns_409(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)
    headers = auth(admin_token)

    first = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=headers,
    )
    assert first.status_code == 200

    second = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "2.10", "version": 1},
        headers=headers,
    )

    assert second.status_code == 409


async def test_conflict_returns_current_server_state(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)
    headers = auth(admin_token)

    await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=headers,
    )

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "2.10", "version": 1},
        headers=headers,
    )

    assert response.status_code == 409
    body = response.json()
    assert body["submitted_price"] == "2.10"
    assert body["submitted_version"] == 1
    assert body["current_price"] == "1.95"
    assert body["current_version"] == 2


async def test_availability_update_respects_version(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)
    headers = auth(admin_token)

    await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=headers,
    )

    stale = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"availability": "out_of_stock", "version": 1},
        headers=headers,
    )
    assert stale.status_code == 409

    fresh = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"availability": "out_of_stock", "version": 2},
        headers=headers,
    )
    assert fresh.status_code == 200
    assert fresh.json()["availability"] == "out_of_stock"
    assert fresh.json()["version"] == 3


async def test_price_and_availability_can_be_updated_together(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "2.15", "availability": "in_stock", "version": 1},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_price"] == "2.15"
    assert body["availability"] == "in_stock"
    assert body["version"] == 2


async def test_b2b_update_does_not_award_reputation(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )
    assert response.status_code == 200

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.reputation.models import ReputationEvent

    async with session_factory() as session:
        result = await session.execute(select(ReputationEvent))
        assert list(result.scalars().all()) == []


async def test_price_history_records_the_b2b_update(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )

    response = await async_client.get(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}/history",
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["new_price"] == "1.95"
    assert body[0]["previous_price"] == "1.50"


async def test_price_history_identifies_merchant_source(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )

    response = await async_client.get(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}/history",
        headers=auth(admin_token),
    )

    assert response.json()[0]["source"] == "merchant"


async def test_batch_processes_successes_and_conflicts_independently(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_a = await add_listing(async_client, branch_id, product_id, price="1.50")
    product_b_id = await add_product(async_client, "Pan integral")
    listing_b = await add_listing(async_client, branch_id, product_b_id, price="2.00")
    admin_token = await _admin(async_client, store_id)
    headers = auth(admin_token)

    # listing_b's version is bumped out from under the batch request to force a conflict.
    await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_b}",
        json={"price": "2.20", "version": 1},
        headers=headers,
    )

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/pricing/batch",
        json={
            "items": [
                {"store_product_id": listing_a, "price": "1.75", "version": 1},
                {"store_product_id": listing_b, "price": "2.50", "version": 1},
            ]
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["updated"]) == 1
    assert body["updated"][0]["store_product_id"] == listing_a
    assert body["updated"][0]["current_price"] == "1.75"
    assert len(body["conflicts"]) == 1
    assert body["conflicts"][0]["store_product_id"] == listing_b
    assert body["conflicts"][0]["current_price"] == "2.20"
    assert body["failed"] == []


async def test_batch_rejects_a_store_product_from_another_organization(async_client: AsyncClient) -> None:
    store_a_id, branch_a_id = await seed_store(async_client, "Super 99")
    store_b_id, branch_b_id = await seed_store(async_client, "Riba Smith")
    product_id = await add_product(async_client)
    listing_a = await add_listing(async_client, branch_a_id, product_id, price="1.50")
    listing_b = await add_listing(async_client, branch_b_id, product_id, price="3.00")
    admin_a_token = await _admin(async_client, store_a_id, "admin-a@example.com")

    response = await async_client.post(
        f"/b2b/organizations/{store_a_id}/pricing/batch",
        json={
            "items": [
                {"store_product_id": listing_a, "price": "1.75", "version": 1},
                {"store_product_id": listing_b, "price": "3.50", "version": 1},
            ]
        },
        headers=auth(admin_a_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["updated"]) == 1
    assert body["updated"][0]["store_product_id"] == listing_a
    assert len(body["failed"]) == 1
    assert body["failed"][0]["store_product_id"] == listing_b
    assert body["failed"][0]["error"] == "forbidden"

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        listing = await session.get(StoreProduct, listing_b)
        assert listing is not None
        assert listing.current_price == Decimal("3.00")  # untouched


async def test_batch_authorizes_each_item_against_the_employees_own_branch_scope(async_client: AsyncClient) -> None:
    """An array-param endpoint like batch pricing must authorize every item individually --
    a single in-scope item must never let an out-of-scope item in the same request slip through."""
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    product_id = await add_product(async_client)
    listing_in_scope = await add_listing(async_client, branch_id, product_id, price="1.50")
    product_b_id = await add_product(async_client, "Pan integral")
    listing_out_of_scope = await add_listing(async_client, other_branch_id, product_b_id, price="3.00")

    employee_id, employee_token = await register_and_login(async_client, "employee-batch@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/pricing/batch",
        json={
            "items": [
                {"store_product_id": listing_in_scope, "price": "1.75", "version": 1},
                {"store_product_id": listing_out_of_scope, "price": "3.50", "version": 1},
            ]
        },
        headers=auth(employee_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["updated"]) == 1
    assert body["updated"][0]["store_product_id"] == listing_in_scope
    assert len(body["failed"]) == 1
    assert body["failed"][0]["store_product_id"] == listing_out_of_scope
    assert body["failed"][0]["error"] == "forbidden"

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        listing = await session.get(StoreProduct, listing_out_of_scope)
        assert listing is not None
        assert listing.current_price == Decimal("3.00")  # untouched


async def test_successful_update_publishes_the_existing_realtime_event(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )
    assert response.status_code == 200

    fake_redis = async_client.fake_redis  # type: ignore[attr-defined]
    assert len(fake_redis.published) == 1
    channel, message = fake_redis.published[0]
    assert channel == f"price_updates:{listing_id}"
    assert '"source": "merchant"' in message


async def test_inactive_listing_cannot_be_updated_from_pricing(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    product_id = await add_product(async_client)
    listing_id = await add_listing(async_client, branch_id, product_id, price="1.50", status="inactive")
    admin_token = await _admin(async_client, store_id)

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{listing_id}",
        json={"price": "1.95", "version": 1},
        headers=auth(admin_token),
    )

    assert response.status_code == 400
