from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from app.features.organizations.dependencies import get_b2b_pricing_service, require_organization_member
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization, ListingNotActive
from app.features.organizations.models import OrganizationMember
from app.features.organizations.pricing_schemas import (
    B2BBatchUpdateRequest,
    B2BBatchUpdateResponse,
    B2BPriceConflictRead,
    B2BPriceUpdateRequest,
    PricingListItemRead,
)
from app.features.organizations.pricing_service import B2BPricingService
from app.features.auth.dependencies import get_current_user
from app.features.pricing.enums import Availability
from app.features.pricing.exceptions import PriceVersionConflict, StoreProductNotFound
from app.features.pricing.schemas import PriceHistoryRead
from app.features.users.models import User

router = APIRouter(prefix="/b2b", tags=["b2b-pricing"])


@router.get("/organizations/{store_id}/pricing/store-products", response_model=list[PricingListItemRead])
async def list_pricing(
    store_id: int,
    branch_id: int | None = None,
    category_id: int | None = None,
    availability: Availability | None = None,
    name: str | None = None,
    barcode: str | None = None,
    stale_before: datetime | None = None,
    include_inactive: bool = False,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BPricingService = Depends(get_b2b_pricing_service),
) -> list[PricingListItemRead]:
    try:
        return await service.list_pricing(
            store_id,
            member,
            branch_id=branch_id,
            category_id=category_id,
            availability=availability,
            name=name,
            barcode=barcode,
            stale_before=stale_before,
            include_inactive=include_inactive,
        )
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.get(
    "/organizations/{store_id}/pricing/store-products/{store_product_id}/history",
    response_model=list[PriceHistoryRead],
)
async def get_pricing_history(
    store_id: int,
    store_product_id: int,
    member: OrganizationMember = Depends(require_organization_member),
    service: B2BPricingService = Depends(get_b2b_pricing_service),
) -> list[PriceHistoryRead]:
    try:
        return await service.get_history(store_id, member, store_product_id)
    except StoreProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Store product not found") from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc


@router.patch("/organizations/{store_id}/pricing/store-products/{store_product_id}")
async def update_pricing_store_product(
    store_id: int,
    store_product_id: int,
    payload: B2BPriceUpdateRequest,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: B2BPricingService = Depends(get_b2b_pricing_service),
) -> PricingListItemRead:
    try:
        return await service.update_store_product(store_id, member, store_product_id, payload, current_user.id)
    except StoreProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Store product not found") from exc
    except InvalidBranchForOrganization as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Branch does not belong to this organization") from exc
    except BranchAccessDenied as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this branch") from exc
    except ListingNotActive as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This listing is not active") from exc
    except PriceVersionConflict as exc:
        conflict = B2BPriceConflictRead(
            store_product_id=store_product_id,
            submitted_price=payload.price,
            submitted_availability=payload.availability,
            submitted_version=payload.version,
            current_price=exc.current_price,
            current_availability=exc.current_availability,
            current_version=exc.current_version,
        )
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=conflict.model_dump(mode="json"))


@router.post("/organizations/{store_id}/pricing/batch", response_model=B2BBatchUpdateResponse)
async def batch_update_pricing(
    store_id: int,
    payload: B2BBatchUpdateRequest,
    member: OrganizationMember = Depends(require_organization_member),
    current_user: User = Depends(get_current_user),
    service: B2BPricingService = Depends(get_b2b_pricing_service),
) -> B2BBatchUpdateResponse:
    return await service.batch_update(store_id, member, payload, current_user.id)
