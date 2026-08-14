from fastapi import APIRouter, Depends, HTTPException, status

from app.features.catalog.exceptions import ProductNotFound
from app.features.organizations.catalog_schemas import (
    BranchListingRead,
    CatalogProductDetail,
    CatalogProductSummary,
    CreateListingRequest,
    UpdateListingStatusRequest,
)
from app.features.organizations.catalog_service import B2BCatalogService
from app.features.organizations.dependencies import get_b2b_catalog_service, require_organization_member
from app.features.organizations.enums import OrganizationRole
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization
from app.features.organizations.models import OrganizationMember
from app.features.pricing.exceptions import StoreProductNotFound
from app.shared.enums import ModerationStatus

router = APIRouter(prefix="/b2b", tags=["b2b-catalog"])


@router.get("/organizations/{store_id}/catalog/products", response_model=list[CatalogProductSummary])
async def list_catalog_products(
    store_id: int,
    name: str | None = None,
    barcode: str | None = None,
    brand_id: int | None = None,
    category_id: int | None = None,
    status: ModerationStatus | None = None,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BCatalogService = Depends(get_b2b_catalog_service),
) -> list[CatalogProductSummary]:
    return await service.list_products(
        store_id, member, name=name, barcode=barcode, brand_id=brand_id, category_id=category_id, status=status
    )


@router.get(
    "/organizations/{store_id}/catalog/products/{product_id}",
    response_model=CatalogProductDetail,
)
async def get_catalog_product(
    store_id: int,
    product_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BCatalogService = Depends(get_b2b_catalog_service),
) -> CatalogProductDetail:
    try:
        return await service.get_product(store_id, member, product_id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found") from exc


@router.get(
    "/organizations/{store_id}/catalog/products/{product_id}/branches",
    response_model=list[BranchListingRead],
)
async def list_catalog_product_branches(
    store_id: int,
    product_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BCatalogService = Depends(get_b2b_catalog_service),
) -> list[BranchListingRead]:
    try:
        return await service.list_branch_listings(store_id, member, product_id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found") from exc


@router.post(
    "/organizations/{store_id}/catalog/products/{product_id}/branches",
    response_model=list[BranchListingRead],
    status_code=status.HTTP_201_CREATED,
)
async def create_catalog_product_listings(
    store_id: int,
    product_id: int,
    payload: CreateListingRequest,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BCatalogService = Depends(get_b2b_catalog_service),
) -> list[BranchListingRead]:
    _require_manager_or_admin(member)
    try:
        return await service.create_or_reactivate_listings(store_id, member, product_id, payload)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found") from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.patch(
    "/organizations/{store_id}/catalog/products/{product_id}/branches/{branch_id}",
    response_model=BranchListingRead,
)
async def update_catalog_product_listing(
    store_id: int,
    product_id: int,
    branch_id: int,
    payload: UpdateListingStatusRequest,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BCatalogService = Depends(get_b2b_catalog_service),
) -> BranchListingRead:
    _require_manager_or_admin(member)
    try:
        return await service.update_listing_status(store_id, member, product_id, branch_id, payload)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found") from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
    except StoreProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This product is not listed at that branch") from exc


def _require_manager_or_admin(member: OrganizationMember) -> None:
    """EMPLOYEE is read-only for the catalog per the Fase 10.5 spec -- only
    ORGANIZATION_ADMIN/MANAGER may create, reactivate, or deactivate a listing."""
    if member.role not in (OrganizationRole.ORGANIZATION_ADMIN, OrganizationRole.MANAGER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
