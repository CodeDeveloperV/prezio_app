from datetime import datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient

from tests.test_b2b_catalog import _admin, add_listing, add_product
from tests.test_organization_branches import add_branch, grant_branch_access
from tests.test_organizations import add_membership, auth, register_and_login, seed_store
from tests.test_reports import add_report

ANALYTICS_URL = "/b2b/organizations/{store_id}/analytics/{endpoint}"

NOW = datetime.now(timezone.utc)
PAST_START = NOW - timedelta(days=10)
FUTURE_START = NOW + timedelta(days=10)
FUTURE_END = NOW + timedelta(days=20)
PAST_END = NOW - timedelta(days=5)


def _url(store_id: int, endpoint: str) -> str:
    return ANALYTICS_URL.format(store_id=store_id, endpoint=endpoint)


async def add_price_history(
    async_client: AsyncClient,
    store_product_id: int,
    *,
    previous_price: str | None,
    new_price: str,
    updated_at: datetime,
) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.pricing.models import PriceHistory

    async with session_factory() as session:
        entry = PriceHistory(
            store_product_id=store_product_id,
            previous_price=Decimal(previous_price) if previous_price is not None else None,
            new_price=Decimal(new_price),
            updated_at=updated_at,
        )
        session.add(entry)
        await session.commit()


async def set_last_verified_at(async_client: AsyncClient, store_product_id: int, when: datetime | None) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from sqlalchemy import select

    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        listing = (
            await session.execute(select(StoreProduct).where(StoreProduct.id == store_product_id))
        ).scalar_one()
        listing.last_verified_at = when
        await session.commit()


async def set_availability(async_client: AsyncClient, store_product_id: int, availability: str) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from sqlalchemy import select

    from app.features.pricing.models import StoreProduct

    async with session_factory() as session:
        listing = (
            await session.execute(select(StoreProduct).where(StoreProduct.id == store_product_id))
        ).scalar_one()
        listing.availability = availability
        await session.commit()


async def add_promotion(
    async_client: AsyncClient,
    store_id: int,
    *,
    status: str = "published",
    start_at: datetime = PAST_START,
    end_at: datetime = FUTURE_END,
    branch_ids: list[int] | None = None,
    name: str = "Promo test",
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.promotions.models import Promotion, PromotionBranch

    async with session_factory() as session:
        promotion = Promotion(
            store_id=store_id,
            name=name,
            type="percentage_discount",
            status=status,
            priority=1,
            percentage_value=Decimal("10.00"),
            start_at=start_at,
            end_at=end_at,
        )
        session.add(promotion)
        await session.flush()
        for branch_id in branch_ids or []:
            session.add(PromotionBranch(promotion_id=promotion.id, store_branch_id=branch_id))
        await session.commit()
        await session.refresh(promotion)
        return promotion.id


async def add_coupon(
    async_client: AsyncClient,
    store_id: int,
    *,
    status: str = "published",
    start_at: datetime = PAST_START,
    end_at: datetime = FUTURE_END,
    code: str = "TEST10",
    applies_to_all_branches: bool = True,
    branch_ids: list[int] | None = None,
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.coupons.models import Coupon, CouponBranch

    async with session_factory() as session:
        coupon = Coupon(
            store_id=store_id,
            name="Coupon test",
            code=code,
            normalized_code=code.upper(),
            type="percentage_discount",
            status=status,
            percentage_value=Decimal("10.00"),
            applies_to_all_branches=applies_to_all_branches,
            start_at=start_at,
            end_at=end_at,
        )
        session.add(coupon)
        await session.flush()
        for branch_id in branch_ids or []:
            session.add(CouponBranch(coupon_id=coupon.id, store_branch_id=branch_id))
        await session.commit()
        await session.refresh(coupon)
        return coupon.id


async def add_resolved_report(
    async_client: AsyncClient,
    reporter_user_id: int,
    *,
    store_id: int,
    store_branch_id: int,
    store_product_id: int,
    created_at: datetime,
    resolved_at: datetime,
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.reports.models import Report

    async with session_factory() as session:
        report = Report(
            store_id=store_id,
            type="incorrect_price",
            status="resolved",
            priority="medium",
            reporter_user_id=reporter_user_id,
            store_product_id=store_product_id,
            store_branch_id=store_branch_id,
            created_at=created_at,
            resolved_at=resolved_at,
        )
        session.add(report)
        await session.commit()
        await session.refresh(report)
        return report.id


# --- overview: organization/branch scoping + cross-tenant isolation ------------------------------------------------


async def test_overview_respects_organization_scope(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    product_id = await add_product(async_client)
    await add_listing(async_client, branch_id, product_id, status="active")
    await add_listing(async_client, branch_id, await add_product(async_client, "P2"), status="inactive")

    response = await async_client.get(_url(store_id, "overview"), headers=auth(admin_token))

    assert response.status_code == 200
    body = response.json()
    assert body["active_listings"] == 1
    assert body["active_branches"] == 1


async def test_manager_overview_scoped_to_assigned_branches(async_client: AsyncClient) -> None:
    store_id, branch_1 = await seed_store(async_client)
    branch_2 = await add_branch(async_client, store_id, "Sucursal 2", "Colón")
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_1)

    product_id = await add_product(async_client)
    await add_listing(async_client, branch_1, product_id, status="active")
    await add_listing(async_client, branch_2, await add_product(async_client, "P2"), status="active")

    response = await async_client.get(_url(store_id, "overview"), headers=auth(manager_token))

    assert response.status_code == 200
    body = response.json()
    assert body["active_listings"] == 1
    assert body["active_branches"] == 1


async def test_org_a_never_receives_org_b_overview_data(async_client: AsyncClient) -> None:
    store_a, branch_a = await seed_store(async_client, "Super 99")
    store_b, branch_b = await seed_store(async_client, "Riba Smith")
    admin_a_token = await _admin(async_client, store_a, "admin-a@example.com")
    await _admin(async_client, store_b, "admin-b@example.com")

    product_b = await add_product(async_client, "Solo en B")
    await add_listing(async_client, branch_b, product_b, status="active")

    response_a = await async_client.get(_url(store_a, "overview"), headers=auth(admin_a_token))
    assert response_a.status_code == 200
    assert response_a.json()["active_listings"] == 0

    cross_tenant = await async_client.get(_url(store_b, "overview"), headers=auth(admin_a_token))
    assert cross_tenant.status_code == 404


# --- active listings / out of stock ---------------------------------------------------------------------------


async def test_active_listings_only_counts_active_status(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await add_listing(async_client, branch_id, await add_product(async_client, "Active"), status="active")
    await add_listing(async_client, branch_id, await add_product(async_client, "Inactive"), status="inactive")

    response = await async_client.get(_url(store_id, "overview"), headers=auth(admin_token))

    assert response.json()["active_listings"] == 1


async def test_out_of_stock_excludes_inactive_listings(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    active_oos = await add_listing(async_client, branch_id, await add_product(async_client, "P1"), status="active")
    inactive_oos = await add_listing(
        async_client, branch_id, await add_product(async_client, "P2"), status="inactive"
    )
    await set_availability(async_client, active_oos, "out_of_stock")
    await set_availability(async_client, inactive_oos, "out_of_stock")

    response = await async_client.get(_url(store_id, "overview"), headers=auth(admin_token))

    assert response.json()["out_of_stock"] == 1


# --- stale prices reuse the centralized price_freshness_days threshold --------------------------------------------


async def test_stale_prices_uses_existing_freshness_threshold(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    fresh = await add_listing(async_client, branch_id, await add_product(async_client, "Fresh"), status="active")
    stale = await add_listing(async_client, branch_id, await add_product(async_client, "Stale"), status="active")
    await set_last_verified_at(async_client, fresh, NOW - timedelta(days=1))
    await set_last_verified_at(async_client, stale, NOW - timedelta(days=10))

    response = await async_client.get(_url(store_id, "overview"), headers=auth(admin_token))

    assert response.json()["stale_prices"] == 1


# --- PriceHistory aggregation correctness + date filtering ---------------------------------------------------


async def test_pricing_analytics_aggregates_price_history_correctly(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    listing = await add_listing(async_client, branch_id, await add_product(async_client), status="active")

    await add_price_history(
        async_client, listing, previous_price="1.00", new_price="1.50", updated_at=NOW - timedelta(days=1)
    )
    await add_price_history(
        async_client, listing, previous_price="1.50", new_price="1.00", updated_at=NOW - timedelta(days=2)
    )

    response = await async_client.get(
        _url(store_id, "pricing"),
        params={
            "date_from": (NOW - timedelta(days=5)).isoformat(),
            "date_to": (NOW + timedelta(days=1)).isoformat(),
        },
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["increases_count"] == 1
    assert body["decreases_count"] == 1


async def test_pricing_analytics_respects_date_filtering(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    listing = await add_listing(async_client, branch_id, await add_product(async_client), status="active")

    await add_price_history(
        async_client, listing, previous_price="1.00", new_price="1.50", updated_at=NOW - timedelta(days=60)
    )

    response = await async_client.get(
        _url(store_id, "pricing"),
        params={
            "date_from": (NOW - timedelta(days=5)).isoformat(),
            "date_to": (NOW + timedelta(days=1)).isoformat(),
        },
        headers=auth(admin_token),
    )

    body = response.json()
    assert body["increases_count"] == 0
    assert body["decreases_count"] == 0
    assert body["time_series"] == []


# --- promotion/coupon lifecycle correctness (never a stale stored status) -----------------------------------------


async def test_scheduled_future_promotion_does_not_count_as_active(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await add_promotion(async_client, store_id, status="published", start_at=FUTURE_START, end_at=FUTURE_END)

    response = await async_client.get(_url(store_id, "promotions"), headers=auth(admin_token))

    body = response.json()
    assert body["counts"]["active"] == 0
    assert body["counts"]["scheduled"] == 1


async def test_expired_promotion_does_not_count_as_active(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await add_promotion(async_client, store_id, status="published", start_at=PAST_START, end_at=PAST_END)

    response = await async_client.get(_url(store_id, "promotions"), headers=auth(admin_token))

    body = response.json()
    assert body["counts"]["active"] == 0
    assert body["counts"]["expired"] == 1


async def test_coupon_active_lifecycle_is_correct(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    await add_coupon(async_client, store_id, status="published", start_at=PAST_START, end_at=FUTURE_END, code="ACTIVE1")
    await add_coupon(
        async_client, store_id, status="published", start_at=FUTURE_START, end_at=FUTURE_END, code="FUTURE1"
    )
    await add_coupon(async_client, store_id, status="published", start_at=PAST_START, end_at=PAST_END, code="OLD1")
    await add_coupon(async_client, store_id, status="cancelled", start_at=PAST_START, end_at=FUTURE_END, code="CANC1")

    response = await async_client.get(_url(store_id, "coupons"), headers=auth(admin_token))

    body = response.json()
    assert body["counts"]["active"] == 1
    assert body["counts"]["scheduled"] == 1
    assert body["counts"]["expired"] == 1
    assert body["counts"]["cancelled"] == 1


# --- reports analytics -----------------------------------------------------------------------------------------


async def test_reports_overview_counts_are_correct(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id, _ = await register_and_login(async_client, "reporter@example.com")
    product_id = await add_product(async_client)
    listing = await add_listing(async_client, branch_id, product_id, status="active")

    await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=listing, store_branch_id=branch_id,
        status="open", priority="high",
    )
    await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=listing, store_branch_id=branch_id,
        status="in_review",
    )
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.reports.models import Report

    async with session_factory() as session:
        session.add(
            Report(
                store_id=store_id,
                type="incorrect_price",
                status="dismissed",
                priority="medium",
                reporter_user_id=reporter_id,
                store_product_id=listing,
                store_branch_id=branch_id,
                dismissed_at=NOW - timedelta(days=1),
            )
        )
        await session.commit()

    response = await async_client.get(
        _url(store_id, "reports"),
        params={
            "date_from": (NOW - timedelta(days=5)).isoformat(),
            "date_to": (NOW + timedelta(days=1)).isoformat(),
        },
        headers=auth(admin_token),
    )

    body = response.json()
    assert body["open_count"] == 2  # OPEN + IN_REVIEW
    assert body["in_review_count"] == 1
    assert body["high_priority_open_count"] == 1
    assert body["dismissed_count"] == 1


async def test_report_resolution_time_only_counts_resolved_reports(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id, _ = await register_and_login(async_client, "reporter@example.com")
    product_id = await add_product(async_client)
    listing = await add_listing(async_client, branch_id, product_id, status="active")

    created_at = NOW - timedelta(days=3)
    resolved_at = NOW - timedelta(days=1)
    await add_resolved_report(
        async_client, reporter_id, store_id=store_id, store_branch_id=branch_id, store_product_id=listing,
        created_at=created_at, resolved_at=resolved_at,
    )
    # Still-open report must not pollute the average resolution time.
    await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=listing, store_branch_id=branch_id,
        status="open",
    )

    response = await async_client.get(
        _url(store_id, "reports"),
        params={
            "date_from": (NOW - timedelta(days=5)).isoformat(),
            "date_to": (NOW + timedelta(days=1)).isoformat(),
        },
        headers=auth(admin_token),
    )

    body = response.json()
    assert body["avg_resolution_hours"] == 48.0


async def test_reports_previous_period_calculation_is_correct(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id, _ = await register_and_login(async_client, "reporter@example.com")
    product_id = await add_product(async_client)
    listing = await add_listing(async_client, branch_id, product_id, status="active")

    date_from = NOW - timedelta(days=7)
    date_to = NOW + timedelta(days=1)
    previous_from = date_from - (date_to - date_from)

    # One resolution in the current period.
    await add_resolved_report(
        async_client, reporter_id, store_id=store_id, store_branch_id=branch_id, store_product_id=listing,
        created_at=date_from - timedelta(days=1), resolved_at=NOW - timedelta(days=1),
    )
    # Two resolutions in the previous period.
    for _ in range(2):
        await add_resolved_report(
            async_client, reporter_id, store_id=store_id, store_branch_id=branch_id, store_product_id=listing,
            created_at=previous_from - timedelta(days=1), resolved_at=previous_from + timedelta(days=1),
        )

    response = await async_client.get(
        _url(store_id, "reports"),
        params={"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
        headers=auth(admin_token),
    )

    body = response.json()
    assert body["resolved_count"] == 1
    assert body["resolved_previous_period_count"] == 2


# --- cross-tenant isolation across every analytics endpoint --------------------------------------------------


async def test_no_cross_tenant_leakage_across_all_analytics_endpoints(async_client: AsyncClient) -> None:
    store_a, branch_a = await seed_store(async_client, "Super 99")
    store_b, branch_b = await seed_store(async_client, "Riba Smith")
    admin_a_token = await _admin(async_client, store_a, "admin-a@example.com")
    await _admin(async_client, store_b, "admin-b@example.com")

    for endpoint in ("overview", "pricing", "availability", "promotions", "coupons", "reports", "activity"):
        response = await async_client.get(_url(store_b, endpoint), headers=auth(admin_a_token))
        assert response.status_code == 404, f"{endpoint} leaked cross-tenant access"


# --- role restrictions: detailed analytics are admin/manager-only, overview/activity are for everyone --------


async def test_employee_is_forbidden_from_detailed_analytics_endpoints(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    await add_membership(async_client, store_id, employee_id, "employee")

    for endpoint in ("pricing", "availability", "promotions", "coupons", "reports"):
        response = await async_client.get(_url(store_id, endpoint), headers=auth(employee_token))
        assert response.status_code == 403, f"employee should not access {endpoint}"


async def test_manager_can_access_detailed_analytics_endpoints(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    manager_id, manager_token = await register_and_login(async_client, "manager-analytics@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)

    for endpoint in ("pricing", "availability", "promotions", "coupons", "reports"):
        response = await async_client.get(_url(store_id, endpoint), headers=auth(manager_token))
        assert response.status_code == 200, f"manager should access {endpoint}"


async def test_employee_can_access_overview_and_activity(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    employee_id, employee_token = await register_and_login(async_client, "employee-overview@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    for endpoint in ("overview", "activity"):
        response = await async_client.get(_url(store_id, endpoint), headers=auth(employee_token))
        assert response.status_code == 200, f"employee should access {endpoint}"
