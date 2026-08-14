from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.features.organizations.enums import OrganizationMemberStatus, OrganizationRole


class OrganizationRead(BaseModel):
    id: int
    name: str
    country: str


class OrganizationMemberRead(BaseModel):
    id: int
    store_id: int
    user_id: int
    user_email: str
    role: OrganizationRole
    status: OrganizationMemberStatus
    branch_ids: list[int]
    joined_at: datetime


class MyMembershipRead(BaseModel):
    """One row per organization the current user belongs to -- lets the portal show an
    organization switcher and resolve role/branch scope right after login."""

    organization: OrganizationRead
    role: OrganizationRole
    status: OrganizationMemberStatus
    branch_ids: list[int]


class OrganizationMemberInvite(BaseModel):
    email: EmailStr
    role: OrganizationRole
    branch_ids: list[int] = []


class OrganizationMemberUpdate(BaseModel):
    role: OrganizationRole | None = None
    status: OrganizationMemberStatus | None = None
    branch_ids: list[int] | None = None
