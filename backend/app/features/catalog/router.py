from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.features.auth.dependencies import get_current_user
from app.features.catalog.exceptions import BarcodeNotFound, DuplicateBarcodeError, ProductNotFound
from app.features.catalog.product_matching_service import ProductMatchingService
from app.features.catalog.recognition_service import ProductRecognitionService
from app.features.catalog.repository import (
    BrandRepository,
    CategoryRepository,
    ProductBarcodeRepository,
    ProductRepository,
)
from app.features.catalog.resolution_engine import CatalogResolutionEngine
from app.features.catalog.schemas import (
    AttachBarcodeRequest,
    CategoryRead,
    CreateProductRequest,
    ProductBarcodeRead,
    ProductRead,
    ScanBarcodeRequest,
    ScanResult,
)
from app.features.catalog.service import CatalogService
from app.features.pricing.repository import StoreProductRepository
from app.features.reputation.repository import ReputationEventRepository
from app.features.reputation.service import ReputationService
from app.features.stores.exceptions import StoreBranchNotFound
from app.features.stores.repository import StoreBranchRepository
from app.features.users.models import User

router = APIRouter(prefix="/catalog", tags=["catalog"])


def get_catalog_service(db: AsyncSession = Depends(get_db)) -> CatalogService:
    return CatalogService(CategoryRepository(db), ProductRepository(db))


def get_recognition_service(db: AsyncSession = Depends(get_db)) -> ProductRecognitionService:
    products = ProductRepository(db)
    brands = BrandRepository(db)
    engine = CatalogResolutionEngine(
        db,
        products,
        ProductBarcodeRepository(db),
        StoreProductRepository(db),
        brands,
        ProductMatchingService(products),
        ReputationService(ReputationEventRepository(db)),
    )
    return ProductRecognitionService(engine, ProductBarcodeRepository(db), StoreBranchRepository(db), brands)


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(service: CatalogService = Depends(get_catalog_service)) -> list[CategoryRead]:
    categories = await service.list_categories()
    return [CategoryRead.model_validate(c) for c in categories]


@router.get("/products", response_model=list[ProductRead])
async def list_products(service: CatalogService = Depends(get_catalog_service)) -> list[ProductRead]:
    products = await service.list_products()
    return [ProductRead.model_validate(p) for p in products]


@router.post("/scan", response_model=ScanResult)
async def scan_barcode(
    payload: ScanBarcodeRequest,
    current_user: User = Depends(get_current_user),
    service: ProductRecognitionService = Depends(get_recognition_service),
) -> ScanResult:
    try:
        return await service.scan(payload)
    except StoreBranchNotFound as exc:
        raise HTTPException(404, "Store branch not found") from exc


@router.post("/products/{product_id}/barcodes", response_model=ProductBarcodeRead, status_code=201)
async def attach_barcode(
    product_id: int,
    payload: AttachBarcodeRequest,
    current_user: User = Depends(get_current_user),
    service: ProductRecognitionService = Depends(get_recognition_service),
) -> ProductBarcodeRead:
    try:
        barcode = await service.attach_barcode_to_existing_product(product_id, payload, current_user.id)
    except ProductNotFound as exc:
        raise HTTPException(404, "Product not found") from exc
    except DuplicateBarcodeError as exc:
        raise HTTPException(409, "Barcode already registered for a different product at this store") from exc

    return ProductBarcodeRead.model_validate(barcode)


@router.post("/products", response_model=ProductRead, status_code=201)
async def create_product_from_scan(
    payload: CreateProductRequest,
    current_user: User = Depends(get_current_user),
    service: ProductRecognitionService = Depends(get_recognition_service),
) -> ProductRead:
    try:
        product = await service.create_product_from_scan(payload, current_user.id)
    except DuplicateBarcodeError as exc:
        raise HTTPException(409, "Barcode already registered for a different product at this store") from exc

    return ProductRead.model_validate(product)


@router.post("/barcodes/{barcode_id}/report", response_model=ProductBarcodeRead)
async def report_incorrect_barcode(
    barcode_id: int,
    current_user: User = Depends(get_current_user),
    service: ProductRecognitionService = Depends(get_recognition_service),
) -> ProductBarcodeRead:
    """Any authenticated user can flag "producto incorrecto" during the scan flow -- this is
    a normal user action, not a moderator review (see ModerationService.reject_barcode for that)."""
    try:
        barcode = await service.report_incorrect_barcode(barcode_id, current_user.id)
    except BarcodeNotFound as exc:
        raise HTTPException(404, "Barcode not found") from exc

    return ProductBarcodeRead.model_validate(barcode)
