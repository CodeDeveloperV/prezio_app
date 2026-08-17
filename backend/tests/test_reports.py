from decimal import Decimal

from httpx import AsyncClient

from tests.test_b2b_catalog import _admin, add_listing, add_product
from tests.test_organization_branches import add_branch, grant_branch_access
from tests.test_organizations import add_membership, auth, register_and_login, seed_store

REPORTS_URL = "/b2b/organizations/{store_id}/reports"


async def add_report(
    async_client: AsyncClient,
    reporter_user_id: int,
    *,
    type: str = "incorrect_price",
    store_id: int | None = None,
    product_id: int | None = None,
    store_product_id: int | None = None,
    store_branch_id: int | None = None,
    status: str = "open",
    priority: str = "medium",
    reported_value: dict | None = None,
    current_value_snapshot: dict | None = None,
) -> int:
    """Seeds a Report row directly (bypassing `POST /reports`) so B2B read/write scenarios can
    be set up without depending on the end-user creation endpoint's own validation."""
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.reports.models import Report

    async with session_factory() as session:
        report = Report(
            store_id=store_id,
            type=type,
            status=status,
            priority=priority,
            reporter_user_id=reporter_user_id,
            product_id=product_id,
            store_product_id=store_product_id,
            store_branch_id=store_branch_id,
            reported_value=reported_value,
            current_value_snapshot=current_value_snapshot,
        )
        session.add(report)
        await session.commit()
        await session.refresh(report)
        return report.id


async def _reporter(async_client: AsyncClient, email: str = "reporter@example.com") -> int:
    user_id, _ = await register_and_login(async_client, email)
    return user_id


# --- visibility / multi-tenant scoping (spec sections 1, 10, 24) -------------------------------------------------


async def test_admin_sees_all_org_reports(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    branch_2 = await add_branch(async_client, store_id, "Sucursal 2", "Colón")
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp1 = await add_listing(async_client, branch_id, product_id)
    sp2 = await add_listing(async_client, branch_2, product_id)

    await add_report(async_client, reporter_id, store_id=store_id, store_product_id=sp1, store_branch_id=branch_id)
    await add_report(async_client, reporter_id, store_id=store_id, store_product_id=sp2, store_branch_id=branch_2)

    response = await async_client.get(REPORTS_URL.format(store_id=store_id), headers=auth(admin_token))

    assert response.status_code == 200
    assert response.json()["total"] == 2


async def test_manager_sees_only_branch_scoped_reports(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    branch_2 = await add_branch(async_client, store_id, "Sucursal 2", "Colón")
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp1 = await add_listing(async_client, branch_id, product_id)
    sp2 = await add_listing(async_client, branch_2, product_id)

    await add_report(async_client, reporter_id, store_id=store_id, store_product_id=sp1, store_branch_id=branch_id)
    await add_report(async_client, reporter_id, store_id=store_id, store_product_id=sp2, store_branch_id=branch_2)

    response = await async_client.get(REPORTS_URL.format(store_id=store_id), headers=auth(manager_token))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["store_branch_id"] == branch_id


async def test_manager_cannot_access_foreign_branch_report(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    branch_2 = await add_branch(async_client, store_id, "Sucursal 2", "Colón")
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")
    await grant_branch_access(async_client, member_id, branch_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp2 = await add_listing(async_client, branch_2, product_id)

    report_id = await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=sp2, store_branch_id=branch_2
    )

    response = await async_client.get(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}", headers=auth(manager_token)
    )

    assert response.status_code == 404


async def test_employee_is_read_only(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)
    report_id = await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=sp, store_branch_id=branch_id
    )

    read_response = await async_client.get(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}", headers=auth(employee_token)
    )
    assert read_response.status_code == 200

    take_response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/take", headers=auth(employee_token)
    )
    assert take_response.status_code == 403


async def test_organization_a_cannot_access_organization_b_report(async_client: AsyncClient) -> None:
    store_a, branch_a = await seed_store(async_client, "Super A")
    store_b, branch_b = await seed_store(async_client, "Super B")
    admin_a_token = await _admin(async_client, store_a, email="admin-a@example.com")
    await _admin(async_client, store_b, email="admin-b@example.com")
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp_b = await add_listing(async_client, branch_b, product_id)

    report_id = await add_report(
        async_client, reporter_id, store_id=store_b, store_product_id=sp_b, store_branch_id=branch_b
    )

    url_in_a = f"{REPORTS_URL.format(store_id=store_a)}/{report_id}"
    get_response = await async_client.get(url_in_a, headers=auth(admin_a_token))
    take_response = await async_client.post(f"{url_in_a}/take", headers=auth(admin_a_token))
    status_response = await async_client.patch(
        f"{url_in_a}/status", json={"status": "in_review"}, headers=auth(admin_a_token)
    )
    assign_response = await async_client.post(f"{url_in_a}/assign", json={}, headers=auth(admin_a_token))
    priority_response = await async_client.patch(
        f"{url_in_a}/priority", json={"priority": "high"}, headers=auth(admin_a_token)
    )
    resolve_response = await async_client.post(
        f"{url_in_a}/resolve", json={"resolution_type": "price_updated"}, headers=auth(admin_a_token)
    )
    dismiss_response = await async_client.post(f"{url_in_a}/dismiss", json={}, headers=auth(admin_a_token))

    for response in (
        get_response,
        take_response,
        status_response,
        assign_response,
        priority_response,
        resolve_response,
        dismiss_response,
    ):
        assert response.status_code == 404, response.request.method


# --- lifecycle transitions (spec section 6) -------------------------------------------------


async def test_open_to_in_review_is_valid(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)
    report_id = await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=sp, store_branch_id=branch_id
    )

    response = await async_client.patch(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/status",
        json={"status": "in_review"},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "in_review"


async def test_in_review_to_resolved_is_valid(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)
    report_id = await add_report(
        async_client,
        reporter_id,
        store_id=store_id,
        store_product_id=sp,
        store_branch_id=branch_id,
        status="in_review",
    )

    response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/resolve",
        json={"resolution_type": "no_issue_found", "resolution_note": "Precio verificado en sitio"},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"


async def test_resolved_report_keeps_resolution_metadata(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    admin_id, _ = await register_and_login(async_client, "admin@example.com")
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)
    report_id = await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=sp, store_branch_id=branch_id
    )

    response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/resolve",
        json={"resolution_type": "price_updated", "resolution_note": "Actualizado en Pricing"},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["resolution_type"] == "price_updated"
    assert body["resolution_note"] == "Actualizado en Pricing"
    assert body["resolved_by"] is not None
    assert body["resolved_at"] is not None


async def test_dismissed_report_keeps_dismissal_metadata(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)
    report_id = await add_report(
        async_client, reporter_id, store_id=store_id, store_product_id=sp, store_branch_id=branch_id
    )

    response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/dismiss",
        json={"resolution_note": "No aplica, precio correcto"},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "dismissed"
    assert body["resolution_note"] == "No aplica, precio correcto"
    assert body["dismissed_by"] is not None
    assert body["dismissed_at"] is not None


# --- filters (spec section 18) -------------------------------------------------


async def test_filter_by_type(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)

    await add_report(
        async_client, reporter_id, type="incorrect_price", store_id=store_id, store_product_id=sp, store_branch_id=branch_id
    )
    await add_report(
        async_client,
        reporter_id,
        type="incorrect_availability",
        store_id=store_id,
        store_product_id=sp,
        store_branch_id=branch_id,
    )

    response = await async_client.get(
        REPORTS_URL.format(store_id=store_id), params={"type": "incorrect_price"}, headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["type"] == "incorrect_price"


async def test_filter_by_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    branch_2 = await add_branch(async_client, store_id, "Sucursal 2", "Colón")
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp1 = await add_listing(async_client, branch_id, product_id)
    sp2 = await add_listing(async_client, branch_2, product_id)

    await add_report(async_client, reporter_id, store_id=store_id, store_product_id=sp1, store_branch_id=branch_id)
    await add_report(async_client, reporter_id, store_id=store_id, store_product_id=sp2, store_branch_id=branch_2)

    response = await async_client.get(
        REPORTS_URL.format(store_id=store_id), params={"branch_id": branch_2}, headers=auth(admin_token)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["store_branch_id"] == branch_2


# --- price snapshot / pricing isolation (spec sections 9, 13) -------------------------------------------------


async def test_price_report_creation_keeps_current_value_snapshot(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    reporter_id, reporter_token = await register_and_login(async_client, "reporter@example.com")
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id, price="5.25")

    response = await async_client.post(
        "/reports",
        json={
            "type": "incorrect_price",
            "store_product_id": sp,
            "reported_value": {"reported_price": 4.50},
        },
        headers=auth(reporter_token),
    )

    assert response.status_code == 201
    report_id = response.json()["id"]

    admin_token = await _admin(async_client, store_id)
    detail = await async_client.get(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}", headers=auth(admin_token)
    )
    body = detail.json()
    assert body["current_value_snapshot"]["current_price"] == 5.25
    assert body["reported_value"]["reported_price"] == 4.50


async def test_resolving_report_does_not_modify_price_directly(async_client: AsyncClient) -> None:
    """Resolving a report only updates the Report row -- the real price stays untouched unless
    the operator separately calls the existing B2B pricing endpoint (spec section 13)."""
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id, price="5.25")

    report_id = await add_report(
        async_client,
        reporter_id,
        type="incorrect_price",
        store_id=store_id,
        store_product_id=sp,
        store_branch_id=branch_id,
        reported_value={"reported_price": 4.50},
        current_value_snapshot={"current_price": 5.25, "availability": "in_stock", "version": 1},
    )

    resolve_response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/resolve",
        json={"resolution_type": "price_updated", "resolution_note": "Ajustado"},
        headers=auth(admin_token),
    )
    assert resolve_response.status_code == 200

    listing_response = await async_client.get(
        f"/b2b/organizations/{store_id}/pricing/store-products", headers=auth(admin_token)
    )
    assert listing_response.status_code == 200
    listing = next(item for item in listing_response.json() if item["store_product_id"] == sp)
    assert Decimal(str(listing["current_price"])) == Decimal("5.25")


async def test_price_correction_uses_existing_pricing_service(async_client: AsyncClient) -> None:
    """The actual price fix for an INCORRECT_PRICE report goes through the pre-existing
    Fase 10.6 B2B pricing endpoint, never a Reports-owned mechanism (spec section 13)."""
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id, price="5.25")
    await add_report(
        async_client,
        reporter_id,
        type="incorrect_price",
        store_id=store_id,
        store_product_id=sp,
        store_branch_id=branch_id,
        reported_value={"reported_price": 4.50},
    )

    pricing_response = await async_client.patch(
        f"/b2b/organizations/{store_id}/pricing/store-products/{sp}",
        json={"price": "4.50", "version": 1},
        headers=auth(admin_token),
    )

    assert pricing_response.status_code == 200
    assert Decimal(str(pricing_response.json()["current_price"])) == Decimal("4.50")


async def test_global_product_cannot_be_edited_from_a_report(async_client: AsyncClient) -> None:
    """Resolving/dismissing a DUPLICATE_PRODUCT or INCORRECT_PRODUCT_INFO report must never
    touch the global `Product` row -- only navigate/escalate to catalog moderation (spec
    section 11/16)."""
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client, name="Original Name")
    await add_listing(async_client, branch_id, product_id)

    report_id = await add_report(async_client, reporter_id, type="duplicate_product", product_id=product_id)

    response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_id}/resolve",
        json={"resolution_type": "escalated_to_catalog_moderation", "resolution_note": "Enviado a moderación"},
        headers=auth(admin_token),
    )
    assert response.status_code == 200

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.catalog.models import Product

    async with session_factory() as session:
        product = await session.get(Product, product_id)
        assert product.canonical_name == "Original Name"


# --- grouping (spec section 8) -------------------------------------------------


async def test_duplicate_reports_are_grouped_in_the_list(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)

    for _ in range(3):
        await add_report(
            async_client,
            reporter_id,
            type="incorrect_price",
            store_id=store_id,
            store_product_id=sp,
            store_branch_id=branch_id,
        )

    response = await async_client.get(REPORTS_URL.format(store_id=store_id), headers=auth(admin_token))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["group_report_count"] == 3


async def test_resolving_representative_resolves_grouped_siblings(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_token = await _admin(async_client, store_id)
    reporter_id = await _reporter(async_client)
    product_id = await add_product(async_client)
    sp = await add_listing(async_client, branch_id, product_id)

    report_ids = [
        await add_report(
            async_client,
            reporter_id,
            type="incorrect_price",
            store_id=store_id,
            store_product_id=sp,
            store_branch_id=branch_id,
        )
        for _ in range(3)
    ]

    response = await async_client.post(
        f"{REPORTS_URL.format(store_id=store_id)}/{report_ids[-1]}/resolve",
        json={"resolution_type": "price_updated"},
        headers=auth(admin_token),
    )
    assert response.status_code == 200

    for report_id in report_ids:
        detail = await async_client.get(
            f"{REPORTS_URL.format(store_id=store_id)}/{report_id}", headers=auth(admin_token)
        )
        assert detail.json()["status"] == "resolved"
