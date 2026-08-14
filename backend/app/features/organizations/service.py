from sqlalchemy.ext.asyncio import AsyncSession

from app.features.organizations.enums import OrganizationMemberStatus, OrganizationRole
from app.features.organizations.exceptions import (
    InvalidBranchForOrganization,
    LastOrganizationAdminError,
    OrganizationMemberAlreadyExists,
    OrganizationMembershipNotFound,
    UserNotFoundForInvite,
)
from app.features.organizations.models import OrganizationMember
from app.features.organizations.repository import OrganizationMemberBranchRepository, OrganizationMemberRepository
from app.features.organizations.schemas import (
    MyMembershipRead,
    OrganizationMemberInvite,
    OrganizationMemberRead,
    OrganizationMemberUpdate,
    OrganizationRead,
)
from app.features.stores.repository import StoreBranchRepository, StoreRepository
from app.features.users.repository import UserRepository


class OrganizationMembershipService:
    def __init__(
        self,
        db: AsyncSession,
        members: OrganizationMemberRepository,
        member_branches: OrganizationMemberBranchRepository,
        users: UserRepository,
        stores: StoreRepository,
        store_branches: StoreBranchRepository,
    ) -> None:
        self.db = db
        self.members = members
        self.member_branches = member_branches
        self.users = users
        self.stores = stores
        self.store_branches = store_branches

    async def get_active_membership(self, store_id: int, user_id: int) -> OrganizationMember | None:
        return await self.members.get_active_by_store_and_user(store_id, user_id)

    async def has_branch_access(self, member: OrganizationMember, store_branch_id: int) -> bool:
        if member.role == OrganizationRole.ORGANIZATION_ADMIN:
            return True
        return await self.member_branches.has_access(member.id, store_branch_id)

    async def list_my_memberships(self, user_id: int) -> list[MyMembershipRead]:
        memberships = await self.members.list_by_user(user_id)
        results = []
        for member in memberships:
            store = await self.stores.get_by_id(member.store_id)
            if store is None:
                continue
            results.append(
                MyMembershipRead(
                    organization=OrganizationRead(id=store.id, name=store.name, country=store.country),
                    role=member.role,
                    status=member.status,
                    branch_ids=[b.store_branch_id for b in member.branch_access],
                )
            )
        return results

    async def list_members(self, store_id: int) -> list[OrganizationMemberRead]:
        members = await self.members.list_by_store(store_id)
        results = []
        for member in members:
            user = await self.users.get_by_id(member.user_id)
            if user is None:
                continue
            results.append(self._to_read(member, user.email))
        return results

    async def invite_member(self, store_id: int, payload: OrganizationMemberInvite) -> OrganizationMemberRead:
        user = await self.users.get_by_email(payload.email)
        if user is None:
            raise UserNotFoundForInvite(payload.email)

        existing = await self.members.get_by_store_and_user(store_id, user.id)
        if existing is not None:
            raise OrganizationMemberAlreadyExists(user.id)

        await self._validate_branch_ids(store_id, payload.branch_ids)

        member = OrganizationMember(
            store_id=store_id,
            user_id=user.id,
            role=payload.role,
            status=OrganizationMemberStatus.ACTIVE,
        )
        await self.members.add(member)
        await self.member_branches.replace_for_member(member.id, payload.branch_ids)
        await self.db.commit()

        member = await self.members.get_by_store_and_user(store_id, user.id)
        assert member is not None
        return self._to_read(member, user.email)

    async def update_member(
        self, store_id: int, member_id: int, payload: OrganizationMemberUpdate
    ) -> OrganizationMemberRead:
        member = await self.members.get_by_id(member_id)
        if member is None or member.store_id != store_id:
            raise OrganizationMembershipNotFound(member_id)

        demoting_admin = payload.role is not None and (
            member.role == OrganizationRole.ORGANIZATION_ADMIN and payload.role != OrganizationRole.ORGANIZATION_ADMIN
        )
        deactivating_admin = payload.status == OrganizationMemberStatus.INACTIVE and (
            member.role == OrganizationRole.ORGANIZATION_ADMIN
        )
        if demoting_admin or deactivating_admin:
            await self._guard_last_admin(store_id, member.id)

        if payload.role is not None:
            member.role = payload.role
        if payload.status is not None:
            member.status = payload.status
        if payload.branch_ids is not None:
            await self._validate_branch_ids(store_id, payload.branch_ids)
            await self.member_branches.replace_for_member(member.id, payload.branch_ids)

        await self.db.commit()

        member = await self.members.get_by_id(member_id)
        assert member is not None
        user = await self.users.get_by_id(member.user_id)
        assert user is not None
        return self._to_read(member, user.email)

    async def remove_member(self, store_id: int, member_id: int) -> None:
        member = await self.members.get_by_id(member_id)
        if member is None or member.store_id != store_id:
            raise OrganizationMembershipNotFound(member_id)

        if member.role == OrganizationRole.ORGANIZATION_ADMIN:
            await self._guard_last_admin(store_id, member.id)

        await self.members.delete(member)
        await self.db.commit()

    async def _guard_last_admin(self, store_id: int, excluded_member_id: int) -> None:
        remaining_admins = await self.members.count_active_admins(
            store_id, OrganizationRole.ORGANIZATION_ADMIN, exclude_member_id=excluded_member_id
        )
        if remaining_admins == 0:
            raise LastOrganizationAdminError(store_id)

    async def _validate_branch_ids(self, store_id: int, branch_ids: list[int]) -> None:
        for branch_id in branch_ids:
            branch = await self.store_branches.get_by_id(branch_id)
            if branch is None or branch.store_id != store_id:
                raise InvalidBranchForOrganization(branch_id)

    def _to_read(self, member: OrganizationMember, user_email: str) -> OrganizationMemberRead:
        return OrganizationMemberRead(
            id=member.id,
            store_id=member.store_id,
            user_id=member.user_id,
            user_email=user_email,
            role=member.role,
            status=member.status,
            branch_ids=[b.store_branch_id for b in member.branch_access],
            joined_at=member.joined_at,
        )
