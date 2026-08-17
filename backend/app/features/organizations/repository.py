from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.features.organizations.enums import OrganizationMemberStatus
from app.features.organizations.models import OrganizationMember, OrganizationMemberBranch
from app.shared.base_repository import BaseRepository


class OrganizationMemberRepository(BaseRepository[OrganizationMember]):
    model = OrganizationMember

    async def get_by_id(self, entity_id: int) -> OrganizationMember | None:
        result = await self.session.execute(
            select(OrganizationMember)
            .where(OrganizationMember.id == entity_id)
            .options(selectinload(OrganizationMember.branch_access))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_by_store_and_user(self, store_id: int, user_id: int) -> OrganizationMember | None:
        result = await self.session.execute(
            select(OrganizationMember)
            .where(OrganizationMember.store_id == store_id, OrganizationMember.user_id == user_id)
            .options(selectinload(OrganizationMember.branch_access))
        )
        return result.scalar_one_or_none()

    async def get_active_by_store_and_user(self, store_id: int, user_id: int) -> OrganizationMember | None:
        member = await self.get_by_store_and_user(store_id, user_id)
        if member is None or member.status != OrganizationMemberStatus.ACTIVE:
            return None
        return member

    async def list_by_store(self, store_id: int) -> list[OrganizationMember]:
        result = await self.session.execute(
            select(OrganizationMember)
            .where(OrganizationMember.store_id == store_id)
            .options(selectinload(OrganizationMember.branch_access))
        )
        return list(result.scalars().all())

    async def list_by_user(self, user_id: int) -> list[OrganizationMember]:
        result = await self.session.execute(
            select(OrganizationMember)
            .where(OrganizationMember.user_id == user_id)
            .options(selectinload(OrganizationMember.branch_access))
        )
        return list(result.scalars().all())

    async def count_active_admins(self, store_id: int, role: str, exclude_member_id: int | None = None) -> int:
        query = select(OrganizationMember).where(
            OrganizationMember.store_id == store_id,
            OrganizationMember.role == role,
            OrganizationMember.status == OrganizationMemberStatus.ACTIVE,
        )
        if exclude_member_id is not None:
            query = query.where(OrganizationMember.id != exclude_member_id)
        result = await self.session.execute(query)
        return len(result.scalars().all())


class OrganizationMemberBranchRepository(BaseRepository[OrganizationMemberBranch]):
    model = OrganizationMemberBranch

    async def has_access(self, organization_member_id: int, store_branch_id: int) -> bool:
        result = await self.session.execute(
            select(OrganizationMemberBranch).where(
                OrganizationMemberBranch.organization_member_id == organization_member_id,
                OrganizationMemberBranch.store_branch_id == store_branch_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def replace_for_member(self, organization_member_id: int, branch_ids: list[int]) -> None:
        await self.session.execute(
            delete(OrganizationMemberBranch).where(
                OrganizationMemberBranch.organization_member_id == organization_member_id
            )
        )
        for branch_id in set(branch_ids):
            self.session.add(
                OrganizationMemberBranch(
                    organization_member_id=organization_member_id, store_branch_id=branch_id
                )
            )
        await self.session.flush()
