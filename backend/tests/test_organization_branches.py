from httpx import AsyncClient

from tests.test_organizations import add_membership, auth, register_and_login, seed_store


async def add_branch(async_client: AsyncClient, store_id: int, name: str, city: str) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.stores.models import StoreBranch

    async with session_factory() as session:
        branch = StoreBranch(store_id=store_id, name=name, city=city)
        session.add(branch)
        await session.commit()
        await session.refresh(branch)
        return branch.id


async def grant_branch_access(async_client: AsyncClient, member_id: int, branch_id: int) -> None:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.organizations.models import OrganizationMemberBranch

    async with session_factory() as session:
        session.add(OrganizationMemberBranch(organization_member_id=member_id, store_branch_id=branch_id))
        await session.commit()


async def test_admin_sees_every_branch_of_the_organization(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")

    response = await async_client.get(f"/b2b/organizations/{store_id}/branches", headers=auth(admin_token))

    assert response.status_code == 200
    returned_ids = {b["id"] for b in response.json()}
    assert returned_ids == {branch_id, other_branch_id}


async def test_employee_only_sees_granted_branches(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    other_branch_id = await add_branch(async_client, store_id, "Super 99 - El Dorado", "Ciudad de Panamá")
    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")
    await grant_branch_access(async_client, member_id, branch_id)

    response = await async_client.get(f"/b2b/organizations/{store_id}/branches", headers=auth(employee_token))

    assert response.status_code == 200
    returned_ids = {b["id"] for b in response.json()}
    assert returned_ids == {branch_id}
    assert other_branch_id not in returned_ids


async def test_employee_with_no_branch_access_sees_empty_list(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    employee_id, employee_token = await register_and_login(async_client, "employee@example.com")
    await add_membership(async_client, store_id, employee_id, "employee")

    response = await async_client.get(f"/b2b/organizations/{store_id}/branches", headers=auth(employee_token))

    assert response.status_code == 200
    assert response.json() == []


async def test_admin_from_another_organization_cannot_list_branches(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, _ = await seed_store(async_client, "Riba Smith")
    admin_a_id, admin_a_token = await register_and_login(async_client, "admin-a@example.com")
    await add_membership(async_client, store_a_id, admin_a_id, "organization_admin")

    response = await async_client.get(f"/b2b/organizations/{store_b_id}/branches", headers=auth(admin_a_token))

    assert response.status_code == 404


async def test_admin_creates_branch(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/branches",
        json={"name": "Super 99 - Costa del Este", "city": "Ciudad de Panamá"},
        headers=auth(admin_token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["store_id"] == store_id
    assert body["name"] == "Super 99 - Costa del Este"


async def test_manager_cannot_create_or_update_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    await add_membership(async_client, store_id, manager_id, "manager")

    create_response = await async_client.post(
        f"/b2b/organizations/{store_id}/branches",
        json={"name": "New Branch", "city": "David"},
        headers=auth(manager_token),
    )
    update_response = await async_client.patch(
        f"/b2b/organizations/{store_id}/branches/{branch_id}",
        json={"city": "David"},
        headers=auth(manager_token),
    )

    assert create_response.status_code == 403
    assert update_response.status_code == 403


async def test_admin_updates_branch(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/branches/{branch_id}",
        json={"city": "David"},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    assert response.json()["city"] == "David"


async def test_admin_cannot_update_branch_from_another_organization(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    _, other_branch_id = await seed_store(async_client, "Riba Smith")
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_a_id, admin_id, "organization_admin")

    response = await async_client.patch(
        f"/b2b/organizations/{store_a_id}/branches/{other_branch_id}",
        json={"city": "David"},
        headers=auth(admin_token),
    )

    assert response.status_code == 404
