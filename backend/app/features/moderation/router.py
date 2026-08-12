from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.dependencies import get_current_moderator, get_current_user
from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.repository import ProductAliasRepository, ProductBarcodeRepository, ProductRepository
from app.features.catalog.schemas import ProductAliasRead, ProductBarcodeRead, ProductRead
from app.features.moderation.exceptions import (
    AliasNotFound,
    AlreadyReviewed,
    BarcodeNotFound,
    InvalidMergeRequest,
    ProductMergeNotFound,
)
from app.features.moderation.repository import ProductMergeRepository
from app.features.moderation.schemas import (
    MoveAliasRequest,
    MoveBarcodeRequest,
    ProductMergeRead,
    ProposeProductMergeRequest,
)
from app.features.moderation.service import ModerationService
from app.features.reputation.repository import ReputationEventRepository
from app.features.reputation.service import ReputationService
from app.features.pricing.repository import (
    PriceConfirmationRepository,
    PriceHistoryRepository,
    StoreProductRepository,
)
from app.features.users.models import User
from app.shared.enums import ModerationStatus

router = APIRouter(prefix="/moderation", tags=["moderation"])


def get_moderation_service(db: AsyncSession = Depends(get_db)) -> ModerationService:
    return ModerationService(
        db,
        ProductRepository(db),
        ProductBarcodeRepository(db),
        ProductAliasRepository(db),
        ProductMergeRepository(db),
        StoreProductRepository(db),
        PriceHistoryRepository(db),
        PriceConfirmationRepository(db),
        ReputationService(ReputationEventRepository(db)),
    )


# --- queues (any authenticated user can view what's pending) -------------------------


@router.get("/products", response_model=list[ProductRead])
async def list_products(
    status: ModerationStatus = ModerationStatus.PENDING,
    current_user: User = Depends(get_current_user),
    service: ModerationService = Depends(get_moderation_service),
) -> list[ProductRead]:
    products = await service.list_products(status)
    return [ProductRead.model_validate(p) for p in products]


@router.get("/barcodes", response_model=list[ProductBarcodeRead])
async def list_barcodes(
    status: ModerationStatus = ModerationStatus.PENDING,
    current_user: User = Depends(get_current_user),
    service: ModerationService = Depends(get_moderation_service),
) -> list[ProductBarcodeRead]:
    barcodes = await service.list_barcodes(status)
    return [ProductBarcodeRead.model_validate(b) for b in barcodes]


@router.get("/aliases", response_model=list[ProductAliasRead])
async def list_aliases(
    status: ModerationStatus = ModerationStatus.PENDING,
    current_user: User = Depends(get_current_user),
    service: ModerationService = Depends(get_moderation_service),
) -> list[ProductAliasRead]:
    aliases = await service.list_aliases(status)
    return [ProductAliasRead.model_validate(a) for a in aliases]


@router.get("/merges", response_model=list[ProductMergeRead])
async def list_merges(
    status: ModerationStatus = ModerationStatus.PENDING,
    current_user: User = Depends(get_current_user),
    service: ModerationService = Depends(get_moderation_service),
) -> list[ProductMergeRead]:
    merges = await service.list_merges(status)
    return [ProductMergeRead.model_validate(m) for m in merges]


# --- products (moderator only) -------------------------------------------------------


@router.post("/products/{product_id}/approve", response_model=ProductRead)
async def approve_product(
    product_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductRead:
    try:
        product = await service.approve_product(product_id, moderator.id)
    except ProductNotFound as exc:
        raise HTTPException(404, "Product not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductRead.model_validate(product)


@router.post("/products/{product_id}/reject", response_model=ProductRead)
async def reject_product(
    product_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductRead:
    try:
        product = await service.reject_product(product_id, moderator.id)
    except ProductNotFound as exc:
        raise HTTPException(404, "Product not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductRead.model_validate(product)


# --- barcodes (moderator only) -------------------------------------------------------


@router.post("/barcodes/{barcode_id}/approve", response_model=ProductBarcodeRead)
async def approve_barcode(
    barcode_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductBarcodeRead:
    try:
        barcode = await service.approve_barcode(barcode_id, moderator.id)
    except BarcodeNotFound as exc:
        raise HTTPException(404, "Barcode not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductBarcodeRead.model_validate(barcode)


@router.post("/barcodes/{barcode_id}/reject", response_model=ProductBarcodeRead)
async def reject_barcode(
    barcode_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductBarcodeRead:
    try:
        barcode = await service.reject_barcode(barcode_id, moderator.id)
    except BarcodeNotFound as exc:
        raise HTTPException(404, "Barcode not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductBarcodeRead.model_validate(barcode)


@router.post("/barcodes/{barcode_id}/move", response_model=ProductBarcodeRead)
async def move_barcode(
    barcode_id: int,
    payload: MoveBarcodeRequest,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductBarcodeRead:
    try:
        barcode = await service.move_barcode(barcode_id, payload.target_product_id, moderator.id)
    except BarcodeNotFound as exc:
        raise HTTPException(404, "Barcode not found") from exc
    except ProductNotFound as exc:
        raise HTTPException(404, "Target product not found") from exc
    return ProductBarcodeRead.model_validate(barcode)


# --- aliases (moderator only) -------------------------------------------------------


@router.post("/aliases/{alias_id}/approve", response_model=ProductAliasRead)
async def approve_alias(
    alias_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductAliasRead:
    try:
        alias = await service.approve_alias(alias_id, moderator.id)
    except AliasNotFound as exc:
        raise HTTPException(404, "Alias not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductAliasRead.model_validate(alias)


@router.post("/aliases/{alias_id}/reject", response_model=ProductAliasRead)
async def reject_alias(
    alias_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductAliasRead:
    try:
        alias = await service.reject_alias(alias_id, moderator.id)
    except AliasNotFound as exc:
        raise HTTPException(404, "Alias not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductAliasRead.model_validate(alias)


@router.post("/aliases/{alias_id}/move", response_model=ProductAliasRead)
async def move_alias(
    alias_id: int,
    payload: MoveAliasRequest,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductAliasRead:
    try:
        alias = await service.move_alias(alias_id, payload.target_product_id, moderator.id)
    except AliasNotFound as exc:
        raise HTTPException(404, "Alias not found") from exc
    except ProductNotFound as exc:
        raise HTTPException(404, "Target product not found") from exc
    return ProductAliasRead.model_validate(alias)


# --- product merges -------------------------------------------------------------------


@router.post("/merges", response_model=ProductMergeRead, status_code=201)
async def propose_merge(
    payload: ProposeProductMergeRequest,
    current_user: User = Depends(get_current_user),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductMergeRead:
    """Any authenticated user can propose that two products are duplicates; only a moderator
    can approve the merge and trigger the actual data migration."""
    try:
        merge = await service.propose_merge(
            payload.source_product_id, payload.target_product_id, payload.reason, current_user.id
        )
    except ProductNotFound as exc:
        raise HTTPException(404, "Product not found") from exc
    except InvalidMergeRequest as exc:
        raise HTTPException(400, str(exc)) from exc
    return ProductMergeRead.model_validate(merge)


@router.post("/merges/{merge_id}/approve", response_model=ProductMergeRead)
async def approve_merge(
    merge_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductMergeRead:
    try:
        merge = await service.approve_merge(merge_id, moderator.id)
    except ProductMergeNotFound as exc:
        raise HTTPException(404, "Merge proposal not found") from exc
    except ProductNotFound as exc:
        raise HTTPException(404, "Product not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductMergeRead.model_validate(merge)


@router.post("/merges/{merge_id}/reject", response_model=ProductMergeRead)
async def reject_merge(
    merge_id: int,
    moderator: User = Depends(get_current_moderator),
    service: ModerationService = Depends(get_moderation_service),
) -> ProductMergeRead:
    try:
        merge = await service.reject_merge(merge_id, moderator.id)
    except ProductMergeNotFound as exc:
        raise HTTPException(404, "Merge proposal not found") from exc
    except AlreadyReviewed as exc:
        raise HTTPException(409, str(exc)) from exc
    return ProductMergeRead.model_validate(merge)
