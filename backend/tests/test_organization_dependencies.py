"""Direct unit tests for `require_branch_access` (organizations/dependencies.py).

This dependency isn't wired into any router yet -- it exists for a future per-branch-path-param
endpoint -- so it can't be exercised through `async_client` HTTP calls like the rest of the suite.
Invoking it directly locks in its authorization behavior so a future caller can safely wire it up.
"""

from fastapi import HTTPException
from httpx import AsyncClient
from starlette.requests import Request

from app.features.organizations.dependencies import get_membership_service, require_branch_access
from tests.test_organization_branches import grant_branch_access
from tests.test_organizations import add_membership, register_and_login, seed_store


def _request(branch_id: int) -> Request:
    return Request({"type": "http", "path_params": {"branch_id": branch_id}, "headers": []})


async def test_admin_is_authorized_for_a_branch_of_their_own_organization(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_id, _ = await register_and_login(async_client, "admin-dep@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")

    async with async_client.session_factory() as session:  # type: ignore[attr-defined]
        service = get_membership_service(db=session)
        member = await service.get_active_membership(store_id, admin_id)
        dependency = require_branch_access("branch_id")
        result = await dependency(request=_request(branch_id), store_id=store_id, member=member, service=service)
        assert result.id == member.id


async def test_admin_gets_400_for_a_branch_belonging_to_another_organization(async_client: AsyncClient) -> None:
    store_a, _ = await seed_store(async_client, "Super 99")
    store_b, branch_b = await seed_store(async_client, "Riba Smith")
    admin_id, _ = await register_and_login(async_client, "admin-dep-2@example.com")
    await add_membership(async_client, store_a, admin_id, "organization_admin")

    async with async_client.session_factory() as session:  # type: ignore[attr-defined]
        service = get_membership_service(db=session)
        member = await service.get_active_membership(store_a, admin_id)
        dependency = require_branch_access("branch_id")
        try:
            await dependency(request=_request(branch_b), store_id=store_a, member=member, service=service)
            raise AssertionError("expected HTTPException")
        except HTTPException as exc:
            assert exc.status_code == 400


async def test_employee_without_explicit_grant_gets_403(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    employee_id, _ = await register_and_login(async_client, "employee-dep@example.com")
    await add_membership(async_client, store_id, employee_id, "employee")

    async with async_client.session_factory() as session:  # type: ignore[attr-defined]
        service = get_membership_service(db=session)
        member = await service.get_active_membership(store_id, employee_id)
        dependency = require_branch_access("branch_id")
        try:
            await dependency(request=_request(branch_id), store_id=store_id, member=member, service=service)
            raise AssertionError("expected HTTPException")
        except HTTPException as exc:
            assert exc.status_code == 403


async def test_employee_with_explicit_grant_is_authorized(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    employee_id, _ = await register_and_login(async_client, "employee-dep-2@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    async with async_client.session_factory() as session:  # type: ignore[attr-defined]
        service = get_membership_service(db=session)
        member = await service.get_active_membership(store_id, employee_id)
        dependency = require_branch_access("branch_id")
        result = await dependency(request=_request(branch_id), store_id=store_id, member=member, service=service)
        assert result.id == member.id
