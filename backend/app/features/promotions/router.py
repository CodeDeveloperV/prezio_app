from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.dependencies import get_current_user
from app.features.catalog.exceptions import ProductNotFound
from app.features.organizations.dependencies import get_promotion_service, require_organization_member
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization
from app.features.organizations.models import OrganizationMember
from app.features.promotions.enums import PromotionDisplayStatus, PromotionStatus, PromotionType
from app.features.promotions.exceptions import PromotionNotEditable, PromotionNotFound, PromotionNotPublishable
from app.features.promotions.schemas import (
    PromotionCreate,
    PromotionListRead,
    PromotionRead,
    PromotionUpdate,
)
from app.features.promotions.service import PromotionService
from app.features.users.models import User

router = APIRouter(prefix="/b2b", tags=["b2b-promotions"])


def _require_manager_or_admin(member: OrganizationMember) -> None:
    """EMPLOYEE is strictly read-only for promotions -- stricter than catalog/pricing, since a
    promotion is a higher-impact commercial action (EPIC 10 Fase 10.9 spec)."""
    if member.role not in (OrganizationRole.ORGANIZATION_ADMIN, OrganizationRole.MANAGER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")


@router.get("/organizations/{store_id}/promotions", response_model=PromotionListRead)
async def list_promotions(
    store_id: int,
    name: str | None = None,
    status_filter: PromotionStatus | None = None,
    type: PromotionType | None = None,
    branch_id: int | None = None,
    product_id: int | None = None,
    display_status: PromotionDisplayStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    member: OrganizationMember = Depends(require_organization_member),
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionListRead:
    try:
        return await service.list_promotions(
            store_id,
            member,
            name=name,
            status=status_filter,
            type=type,
            branch_id=branch_id,
            product_id=product_id,
            display_status=display_status,
            page=page,
            page_size=page_size,
        )
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.get("/organizations/{store_id}/promotions/{promotion_id}", response_model=PromotionRead)
async def get_promotion(
    store_id: int,
    promotion_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionRead:
    try:
        return await service.get_promotion(store_id, member, promotion_id)
    except PromotionNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promotion not found") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.post(
    "/organizations/{store_id}/promotions",
    response_model=PromotionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_promotion(
    store_id: int,
    payload: PromotionCreate,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionRead:
    _require_manager_or_admin(member)
    try:
        return await service.create_promotion(store_id, member, payload, current_user.id)
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Product not found") from exc


@router.patch("/organizations/{store_id}/promotions/{promotion_id}", response_model=PromotionRead)
async def update_promotion(
    store_id: int,
    promotion_id: int,
    payload: PromotionUpdate,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionRead:
    _require_manager_or_admin(member)
    try:
        return await service.update_promotion(store_id, member, promotion_id, payload, current_user.id)
    except PromotionNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promotion not found") from exc
    except PromotionNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Product not found") from exc


@router.post("/organizations/{store_id}/promotions/{promotion_id}/publish", response_model=PromotionRead)
async def publish_promotion(
    store_id: int,
    promotion_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionRead:
    _require_manager_or_admin(member)
    try:
        return await service.publish_promotion(store_id, member, promotion_id, current_user.id)
    except PromotionNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promotion not found") from exc
    except PromotionNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
    except PromotionNotPublishable as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.reason) from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.post("/organizations/{store_id}/promotions/{promotion_id}/cancel", response_model=PromotionRead)
async def cancel_promotion(
    store_id: int,
    promotion_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionRead:
    _require_manager_or_admin(member)
    try:
        return await service.cancel_promotion(store_id, member, promotion_id, current_user.id)
    except PromotionNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promotion not found") from exc
    except PromotionNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.delete(
    "/organizations/{store_id}/promotions/{promotion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_promotion(
    store_id: int,
    promotion_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: PromotionService = Depends(get_promotion_service),
) -> None:
    _require_manager_or_admin(member)
    try:
        await service.delete_promotion(store_id, member, promotion_id)
    except PromotionNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Promotion not found") from exc
    except PromotionNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
