from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.dependencies import get_current_user
from app.features.catalog.exceptions import ProductNotFound
from app.features.coupons.enums import CouponDisplayStatus, CouponStatus, CouponType
from app.features.coupons.exceptions import (
    CouponCodeAlreadyExists,
    CouponNotEditable,
    CouponNotFound,
    CouponNotPublishable,
    CouponPermissionDenied,
)
from app.features.coupons.schemas import CouponCreate, CouponListRead, CouponRead, CouponUpdate
from app.features.coupons.service import CouponService
from app.features.organizations.dependencies import get_coupon_service, require_organization_member
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization
from app.features.organizations.models import OrganizationMember
from app.features.users.models import User

router = APIRouter(prefix="/b2b", tags=["b2b-coupons"])


@router.get("/organizations/{store_id}/coupons", response_model=CouponListRead)
async def list_coupons(
    store_id: int,
    name: str | None = None,
    status_filter: CouponStatus | None = None,
    type: CouponType | None = None,
    branch_id: int | None = None,
    product_id: int | None = None,
    display_status: CouponDisplayStatus | None = None,
    page: int = 1,
    page_size: int = 20,
    member: OrganizationMember = Depends(require_organization_member),
    service: CouponService = Depends(get_coupon_service),
) -> CouponListRead:
    try:
        return await service.list_coupons(
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


@router.get("/organizations/{store_id}/coupons/{coupon_id}", response_model=CouponRead)
async def get_coupon(
    store_id: int,
    coupon_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: CouponService = Depends(get_coupon_service),
) -> CouponRead:
    try:
        return await service.get_coupon(store_id, member, coupon_id)
    except CouponNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found") from exc


@router.post(
    "/organizations/{store_id}/coupons",
    response_model=CouponRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_coupon(
    store_id: int,
    payload: CouponCreate,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: CouponService = Depends(get_coupon_service),
) -> CouponRead:
    try:
        return await service.create_coupon(store_id, member, payload, current_user.id)
    except CouponPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an organization admin can manage coupons") from exc
    except CouponCodeAlreadyExists as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Product not found") from exc


@router.patch("/organizations/{store_id}/coupons/{coupon_id}", response_model=CouponRead)
async def update_coupon(
    store_id: int,
    coupon_id: int,
    payload: CouponUpdate,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: CouponService = Depends(get_coupon_service),
) -> CouponRead:
    try:
        return await service.update_coupon(store_id, member, coupon_id, payload, current_user.id)
    except CouponPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an organization admin can manage coupons") from exc
    except CouponNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found") from exc
    except CouponNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
    except CouponCodeAlreadyExists as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Product not found") from exc


@router.post("/organizations/{store_id}/coupons/{coupon_id}/publish", response_model=CouponRead)
async def publish_coupon(
    store_id: int,
    coupon_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: CouponService = Depends(get_coupon_service),
) -> CouponRead:
    try:
        return await service.publish_coupon(store_id, member, coupon_id, current_user.id)
    except CouponPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an organization admin can manage coupons") from exc
    except CouponNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found") from exc
    except CouponNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
    except CouponNotPublishable as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.reason) from exc


@router.post("/organizations/{store_id}/coupons/{coupon_id}/cancel", response_model=CouponRead)
async def cancel_coupon(
    store_id: int,
    coupon_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: CouponService = Depends(get_coupon_service),
) -> CouponRead:
    try:
        return await service.cancel_coupon(store_id, member, coupon_id, current_user.id)
    except CouponPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an organization admin can manage coupons") from exc
    except CouponNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found") from exc
    except CouponNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc


@router.delete(
    "/organizations/{store_id}/coupons/{coupon_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_coupon(
    store_id: int,
    coupon_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: CouponService = Depends(get_coupon_service),
) -> None:
    try:
        await service.delete_coupon(store_id, member, coupon_id)
    except CouponPermissionDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an organization admin can manage coupons") from exc
    except CouponNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found") from exc
    except CouponNotEditable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.reason) from exc
