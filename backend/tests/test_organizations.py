from httpx import AsyncClient

from app.features.stores.models import Store, StoreBranch


async def seed_store(async_client: AsyncClient, name: str = "Super 99") -> tuple[int, int]:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    async with session_factory() as session:
        store = Store(name=name, country="PA")
        session.add(store)
        await session.flush()
        branch = StoreBranch(store_id=store.id, name=f"{name} - San Francisco", city="Ciudad de Panamá")
        session.add(branch)
        await session.commit()
        await session.refresh(store)
        await session.refresh(branch)
        return store.id, branch.id


async def register_and_login(async_client: AsyncClient, email: str, password: str = "s3cret123") -> tuple[int, str]:
    await async_client.post("/auth/register", json={"email": email, "password": password})
    login = await async_client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    me = await async_client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    return me.json()["id"], token


async def add_membership(
    async_client: AsyncClient, store_id: int, user_id: int, role: str, status: str = "active"
) -> int:
    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.organizations.models import OrganizationMember

    async with session_factory() as session:
        member = OrganizationMember(store_id=store_id, user_id=user_id, role=role, status=status)
        session.add(member)
        await session.commit()
        await session.refresh(member)
        return member.id


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_user_with_no_membership_gets_404_not_403(async_client: AsyncClient) -> None:
    """Never distinguish "org doesn't exist" from "you can't see it" -- both 404."""
    store_id, _ = await seed_store(async_client)
    _, token = await register_and_login(async_client, "outsider@example.com")

    response = await async_client.get(f"/b2b/organizations/{store_id}/members", headers=auth(token))

    assert response.status_code == 404


async def test_org_a_admin_cannot_see_org_b_members(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, _ = await seed_store(async_client, "Riba Smith")

    admin_a_id, admin_a_token = await register_and_login(async_client, "admin-a@example.com")
    await add_membership(async_client, store_a_id, admin_a_id, "organization_admin")

    admin_b_id, _ = await register_and_login(async_client, "admin-b@example.com")
    await add_membership(async_client, store_b_id, admin_b_id, "organization_admin")

    response = await async_client.get(f"/b2b/organizations/{store_b_id}/members", headers=auth(admin_a_token))

    assert response.status_code == 404


async def test_org_a_admin_cannot_update_or_remove_org_bs_member_via_own_store_id(async_client: AsyncClient) -> None:
    store_a_id, _ = await seed_store(async_client, "Super 99")
    store_b_id, _ = await seed_store(async_client, "Riba Smith")

    admin_a_id, admin_a_token = await register_and_login(async_client, "admin-a-idor@example.com")
    await add_membership(async_client, store_a_id, admin_a_id, "organization_admin")

    victim_id, _ = await register_and_login(async_client, "victim@example.com")
    victim_member_id = await add_membership(async_client, store_b_id, victim_id, "employee")

    update_response = await async_client.patch(
        f"/b2b/organizations/{store_a_id}/members/{victim_member_id}",
        json={"role": "organization_admin"},
        headers=auth(admin_a_token),
    )
    remove_response = await async_client.delete(
        f"/b2b/organizations/{store_a_id}/members/{victim_member_id}", headers=auth(admin_a_token)
    )

    assert update_response.status_code == 404
    assert remove_response.status_code == 404


async def test_manager_cannot_list_or_invite_members(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    await add_membership(async_client, store_id, manager_id, "manager")

    list_response = await async_client.get(f"/b2b/organizations/{store_id}/members", headers=auth(manager_token))
    invite_response = await async_client.post(
        f"/b2b/organizations/{store_id}/members",
        json={"email": "someone@example.com", "role": "employee"},
        headers=auth(manager_token),
    )

    assert list_response.status_code == 403
    assert invite_response.status_code == 403


async def test_employee_cannot_list_or_invite_members(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    employee_id, employee_token = await register_and_login(async_client, "employee-members@example.com")
    await add_membership(async_client, store_id, employee_id, "employee")

    list_response = await async_client.get(f"/b2b/organizations/{store_id}/members", headers=auth(employee_token))
    invite_response = await async_client.post(
        f"/b2b/organizations/{store_id}/members",
        json={"email": "someone-else@example.com", "role": "employee"},
        headers=auth(employee_token),
    )

    assert list_response.status_code == 403
    assert invite_response.status_code == 403


async def test_admin_invites_existing_user_with_branch_access(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")
    await register_and_login(async_client, "employee@example.com")

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/members",
        json={"email": "employee@example.com", "role": "employee", "branch_ids": [branch_id]},
        headers=auth(admin_token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "employee"
    assert body["status"] == "active"
    assert body["branch_ids"] == [branch_id]


async def test_invite_unknown_email_returns_404(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/members",
        json={"email": "ghost@example.com", "role": "employee"},
        headers=auth(admin_token),
    )

    assert response.status_code == 404


async def test_invite_duplicate_member_returns_409(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")
    manager_id, _ = await register_and_login(async_client, "manager@example.com")
    await add_membership(async_client, store_id, manager_id, "manager")

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/members",
        json={"email": "manager@example.com", "role": "employee"},
        headers=auth(admin_token),
    )

    assert response.status_code == 409


async def test_invite_with_branch_from_another_organization_is_rejected(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client, "Super 99")
    _, other_branch_id = await seed_store(async_client, "Riba Smith")
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")
    await register_and_login(async_client, "employee@example.com")

    response = await async_client.post(
        f"/b2b/organizations/{store_id}/members",
        json={"email": "employee@example.com", "role": "employee", "branch_ids": [other_branch_id]},
        headers=auth(admin_token),
    )

    assert response.status_code == 400


async def test_admin_updates_member_role_status_and_branches(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")
    employee_id, _ = await register_and_login(async_client, "employee@example.com")
    member_id = await add_membership(async_client, store_id, employee_id, "employee")

    response = await async_client.patch(
        f"/b2b/organizations/{store_id}/members/{member_id}",
        json={"role": "manager", "status": "active", "branch_ids": [branch_id]},
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "manager"
    assert body["status"] == "active"
    assert body["branch_ids"] == [branch_id]


async def test_cannot_demote_or_deactivate_last_admin(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    member_id = await add_membership(async_client, store_id, admin_id, "organization_admin")

    demote = await async_client.patch(
        f"/b2b/organizations/{store_id}/members/{member_id}",
        json={"role": "manager"},
        headers=auth(admin_token),
    )
    deactivate = await async_client.patch(
        f"/b2b/organizations/{store_id}/members/{member_id}",
        json={"status": "inactive"},
        headers=auth(admin_token),
    )
    remove = await async_client.delete(
        f"/b2b/organizations/{store_id}/members/{member_id}", headers=auth(admin_token)
    )

    assert demote.status_code == 409
    assert deactivate.status_code == 409
    assert remove.status_code == 409


async def test_admin_can_remove_member_without_deleting_user_account(async_client: AsyncClient) -> None:
    store_id, _ = await seed_store(async_client)
    admin_id, admin_token = await register_and_login(async_client, "admin@example.com")
    await add_membership(async_client, store_id, admin_id, "organization_admin")
    manager_id, manager_token = await register_and_login(async_client, "manager@example.com")
    member_id = await add_membership(async_client, store_id, manager_id, "manager")

    response = await async_client.delete(
        f"/b2b/organizations/{store_id}/members/{member_id}", headers=auth(admin_token)
    )
    still_has_account = await async_client.get("/users/me", headers=auth(manager_token))
    lost_access = await async_client.get(f"/b2b/organizations/{store_id}/members", headers=auth(manager_token))

    assert response.status_code == 204
    assert still_has_account.status_code == 200
    assert lost_access.status_code == 404


async def test_inactive_membership_is_reported_but_denied_access(async_client: AsyncClient) -> None:
    """`/memberships/me` reports status so the UI can show it, but
    `require_organization_member` only resolves ACTIVE memberships, so an inactive
    member gets the same 404 as a non-member (never a 403 that would confirm the
    org exists)."""
    store_id, _ = await seed_store(async_client)
    user_id, token = await register_and_login(async_client, "inactive@example.com")
    await add_membership(async_client, store_id, user_id, "employee", status="inactive")

    my_memberships = await async_client.get("/b2b/memberships/me", headers=auth(token))
    members_list = await async_client.get(f"/b2b/organizations/{store_id}/members", headers=auth(token))

    assert my_memberships.status_code == 200
    [membership] = my_memberships.json()
    assert membership["status"] == "inactive"
    assert members_list.status_code == 404


async def test_my_memberships_lists_active_orgs_with_role_and_branches(async_client: AsyncClient) -> None:
    store_id, branch_id = await seed_store(async_client, "Super 99")
    user_id, token = await register_and_login(async_client, "multi@example.com")
    member_id = await add_membership(async_client, store_id, user_id, "employee")

    session_factory = async_client.session_factory  # type: ignore[attr-defined]
    from app.features.organizations.models import OrganizationMemberBranch

    async with session_factory() as session:
        session.add(OrganizationMemberBranch(organization_member_id=member_id, store_branch_id=branch_id))
        await session.commit()

    response = await async_client.get("/b2b/memberships/me", headers=auth(token))

    assert response.status_code == 200
    [membership] = response.json()
    assert membership["organization"]["id"] == store_id
    assert membership["role"] == "employee"
    assert membership["branch_ids"] == [branch_id]
