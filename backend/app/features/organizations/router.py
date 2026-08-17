from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.dependencies import get_current_user
from app.features.organizations.dependencies import (
    get_membership_service,
    require_organization_member,
    require_organization_role,
)
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.exceptions import (
    BranchNotFound,
    InvalidBranchForOrganization,
    LastOrganizationAdminError,
    OrganizationMemberAlreadyExists,
    OrganizationMembershipNotFound,
    UserNotFoundForInvite,
)
from app.features.organizations.models import OrganizationMember
from app.features.organizations.schemas import (
    BranchCreate,
    BranchUpdate,
    MyMembershipRead,
    OrganizationMemberInvite,
    OrganizationMemberRead,
    OrganizationMemberUpdate,
)
from app.features.organizations.service import OrganizationMembershipService
from app.features.stores.schemas import StoreBranchRead
from app.features.users.models import User

router = APIRouter(prefix="/b2b", tags=["b2b-organizations"])


@router.get("/memberships/me", response_model=list[MyMembershipRead])
async def list_my_memberships(
    current_user: User = Depends(get_current_user),
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> list[MyMembershipRead]:
    return await service.list_my_memberships(current_user.id)


@router.get(
    "/organizations/{store_id}/members",
    response_model=list[OrganizationMemberRead],
    dependencies=[Depends(require_organization_role(OrganizationRole.ORGANIZATION_ADMIN))],
)
async def list_members(
    store_id: int, service: OrganizationMembershipService = Depends(get_membership_service)
) -> list[OrganizationMemberRead]:
    return await service.list_members(store_id)


@router.post(
    "/organizations/{store_id}/members",
    response_model=OrganizationMemberRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_organization_role(OrganizationRole.ORGANIZATION_ADMIN))],
)
async def invite_member(
    store_id: int,
    payload: OrganizationMemberInvite,
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> OrganizationMemberRead:
    try:
        return await service.invite_member(store_id, payload)
    except UserNotFoundForInvite as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Prezio account exists for that email") from exc
    except OrganizationMemberAlreadyExists as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "User is already a member of this organization") from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc


@router.patch(
    "/organizations/{store_id}/members/{member_id}",
    response_model=OrganizationMemberRead,
    dependencies=[Depends(require_organization_role(OrganizationRole.ORGANIZATION_ADMIN))],
)
async def update_member(
    store_id: int,
    member_id: int,
    payload: OrganizationMemberUpdate,
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> OrganizationMemberRead:
    try:
        return await service.update_member(store_id, member_id, payload)
    except OrganizationMembershipNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found") from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except LastOrganizationAdminError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Organization must keep at least one active admin"
        ) from exc


@router.get("/organizations/{store_id}/branches", response_model=list[StoreBranchRead])
async def list_branches(
    store_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> list[StoreBranchRead]:
    return await service.list_branches(store_id, member)


@router.post(
    "/organizations/{store_id}/branches",
    response_model=StoreBranchRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_organization_role(OrganizationRole.ORGANIZATION_ADMIN))],
)
async def create_branch(
    store_id: int,
    payload: BranchCreate,
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> StoreBranchRead:
    return await service.create_branch(store_id, payload)


@router.patch(
    "/organizations/{store_id}/branches/{branch_id}",
    response_model=StoreBranchRead,
    dependencies=[Depends(require_organization_role(OrganizationRole.ORGANIZATION_ADMIN))],
)
async def update_branch(
    store_id: int,
    branch_id: int,
    payload: BranchUpdate,
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> StoreBranchRead:
    try:
        return await service.update_branch(store_id, branch_id, payload)
    except BranchNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found") from exc


@router.delete(
    "/organizations/{store_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_organization_role(OrganizationRole.ORGANIZATION_ADMIN))],
)
async def remove_member(
    store_id: int,
    member_id: int,
    service: OrganizationMembershipService = Depends(get_membership_service),
) -> None:
    try:
        await service.remove_member(store_id, member_id)
    except OrganizationMembershipNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found") from exc
    except LastOrganizationAdminError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Organization must keep at least one active admin"
        ) from exc
