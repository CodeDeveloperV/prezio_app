from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.organizations.enums import OrganizationMemberStatus, OrganizationRole
from app.shared.models_base import Base


class OrganizationMember(Base):
    """A user's B2B membership in a `Store` (the organization/chain acting as tenant).

    One row per (store, user) -- a user cannot join the same organization twice, enforced
    by the unique constraint rather than trusted client-side.
    """

    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("store_id", "user_id", name="uq_organization_members_store_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[OrganizationRole] = mapped_column(Enum(OrganizationRole, native_enum=False))
    status: Mapped[OrganizationMemberStatus] = mapped_column(
        Enum(OrganizationMemberStatus, native_enum=False), default=OrganizationMemberStatus.ACTIVE
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    branch_access: Mapped[list["OrganizationMemberBranch"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )


class OrganizationMemberBranch(Base):
    """Grants an `OrganizationMember` (typically MANAGER/EMPLOYEE) access to one branch.

    Branch access is a scope, not a role -- ORGANIZATION_ADMIN bypasses this table entirely
    and is authorized for every branch of its organization (see `organizations/dependencies.py`).
    """

    __tablename__ = "organization_member_branches"
    __table_args__ = (
        UniqueConstraint("organization_member_id", "store_branch_id", name="uq_org_member_branches"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_member_id: Mapped[int] = mapped_column(
        ForeignKey("organization_members.id", ondelete="CASCADE"), index=True
    )
    store_branch_id: Mapped[int] = mapped_column(ForeignKey("store_branches.id"), index=True)

    member: Mapped["OrganizationMember"] = relationship(back_populates="branch_access")
