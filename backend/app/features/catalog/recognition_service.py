from datetime import datetime, timezone

from app.features.catalog.exceptions import BarcodeNotFound
from app.features.catalog.models import Product, ProductBarcode
from app.features.catalog.repository import BrandRepository, ProductBarcodeRepository
from app.features.catalog.resolution_engine import CatalogResolutionEngine, ResolutionStatus
from app.features.catalog.schemas import (
    AttachBarcodeRequest,
    CreateProductRequest,
    ProductMatchCandidate,
    ProductRead,
    ScanBarcodeRequest,
    ScanConflictResult,
    ScanFoundResult,
    ScanNeedsDisambiguationResult,
    ScanNotFoundResult,
    ScanProductDetails,
)
from app.features.pricing.schemas import StoreProductRead
from app.features.stores.exceptions import StoreBranchNotFound
from app.features.stores.repository import StoreBranchRepository
from app.shared.enums import ModerationStatus


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProductRecognitionService:
    """API-facing adapter over `CatalogResolutionEngine`: translates its typed
    `ResolutionResult` into the wire-format `ScanResult` variants the mobile scanner expects,
    and exposes the barcode-report action. All actual resolution/matching/creation logic lives
    in `CatalogResolutionEngine` / `ProductMatchingService` -- this class owns no domain rules.
    """

    def __init__(
        self,
        engine: CatalogResolutionEngine,
        barcodes: ProductBarcodeRepository,
        store_branches: StoreBranchRepository,
        brands: BrandRepository,
    ) -> None:
        self.engine = engine
        self.barcodes = barcodes
        self.store_branches = store_branches
        self.brands = brands

    async def scan(
        self, request: ScanBarcodeRequest
    ) -> ScanFoundResult | ScanNeedsDisambiguationResult | ScanNotFoundResult | ScanConflictResult:
        branch = await self.store_branches.get_by_id(request.store_branch_id)
        if branch is None:
            raise StoreBranchNotFound(request.store_branch_id)

        result = await self.engine.resolve(
            barcode=request.barcode,
            store_id=branch.store_id,
            store_branch_id=request.store_branch_id,
            name_hint=request.name_hint,
            brand_id=request.brand_id,
            category_id=request.category_id,
            presentation=request.presentation,
            image_url=request.image_url,
        )

        if result.status in (ResolutionStatus.STORE_MATCH, ResolutionStatus.GLOBAL_MATCH):
            product = result.product
            assert product is not None and result.barcode is not None
            brand_name = None
            if product.brand_id is not None:
                brand = await self.brands.get_by_id(product.brand_id)
                brand_name = brand.name if brand else None

            return ScanFoundResult(
                barcode_id=result.barcode.id,
                product=ScanProductDetails(
                    id=product.id,
                    canonical_name=product.canonical_name,
                    brand_name=brand_name,
                    presentation=product.presentation,
                    image_url=product.image_url,
                    status=product.status,
                ),
                store_product=StoreProductRead.model_validate(result.store_product) if result.store_product else None,
            )

        if result.status is ResolutionStatus.POSSIBLE_MATCHES:
            return ScanNeedsDisambiguationResult(
                candidates=[
                    ProductMatchCandidate(
                        product=ProductRead.model_validate(c.product),
                        score=round(c.score, 4),
                        matched_on=c.matched_on,
                    )
                    for c in result.candidates
                ]
            )

        if result.status is ResolutionStatus.CONFLICT:
            return ScanConflictResult(
                candidates=[ProductRead.model_validate(c.product) for c in result.candidates],
                warnings=result.warnings,
            )

        return ScanNotFoundResult()

    async def attach_barcode_to_existing_product(
        self, product_id: int, request: AttachBarcodeRequest, created_by: int
    ) -> ProductBarcode:
        return await self.engine.confirm_candidate(
            product_id=product_id,
            barcode=request.barcode,
            barcode_type=request.barcode_type,
            store_id=request.store_id,
            country=request.country,
            created_by=created_by,
        )

    async def create_product_from_scan(self, request: CreateProductRequest, created_by: int) -> Product:
        return await self.engine.create_new_product(
            canonical_name=request.canonical_name,
            brand_id=request.brand_id,
            brand_name=request.brand_name,
            category_id=request.category_id,
            presentation=request.presentation,
            image_url=request.image_url,
            barcode=request.barcode,
            barcode_type=request.barcode_type,
            store_id=request.store_id,
            country=request.country,
            created_by=created_by,
        )

    async def report_incorrect_barcode(self, barcode_id: int, reported_by: int) -> ProductBarcode:
        """Any authenticated user (not just moderators) can flag that a scanned barcode
        resolved to the wrong product. Marking it REJECTED makes barcode resolution skip it on
        the next scan, so the barcode falls through to the disambiguation flow again instead
        of repeatedly resolving to the same wrong product."""
        barcode = await self.barcodes.get_by_id(barcode_id)
        if barcode is None:
            raise BarcodeNotFound(barcode_id)

        barcode.status = ModerationStatus.REJECTED
        barcode.reviewed_by = reported_by
        barcode.reviewed_at = _utcnow()
        await self.engine.db.commit()
        return barcode
