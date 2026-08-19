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
    ScanPriceOfferRead,
    ScanProductDetails,
)
from app.features.pricing.schemas import StoreProductRead
from app.features.pricing.tax_repository import TaxRateRepository
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
        tax_rates: TaxRateRepository,
    ) -> None:
        self.engine = engine
        self.barcodes = barcodes
        self.store_branches = store_branches
        self.brands = brands
        self.tax_rates = tax_rates

    async def scan(
        self, request: ScanBarcodeRequest
    ) -> ScanFoundResult | ScanNeedsDisambiguationResult | ScanNotFoundResult | ScanConflictResult:
        if request.store_branch_id is not None:
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
        else:
            rows = await self.barcodes.find_matches_for_lookup_any_store(request.barcode)
            if not rows:
                return ScanNotFoundResult()

            distinct_product_ids = {row.product_id for row in rows}
            if len(distinct_product_ids) > 1:
                candidate_products = [await self.engine.products.get_by_id(pid) for pid in distinct_product_ids]
                return ScanConflictResult(
                    candidates=[ProductRead.model_validate(p) for p in candidate_products if p is not None],
                    warnings=[
                        f"Barcode '{request.barcode}' is registered to more than one product. "
                        "Open the manual disambiguation flow to pick the correct one."
                    ],
                )

            row = rows[0]
            product = await self.engine.products.get_by_id(row.product_id)
            if product is None:
                return ScanNotFoundResult()

            brand_name = None
            if product.brand_id is not None:
                brand = await self.brands.get_by_id(product.brand_id)
                brand_name = brand.name if brand else None

            price_offers = await self._build_price_offers(product.id)
            store_product = None
            if price_offers:
                store_product = await self.engine.store_products.get_by_id(price_offers[0].store_product_id)

            return ScanFoundResult(
                barcode_id=row.id,
                product=ScanProductDetails(
                    id=product.id,
                    canonical_name=product.canonical_name,
                    brand_name=brand_name,
                    presentation=product.presentation,
                    image_url=product.image_url,
                    status=product.status,
                ),
                store_product=StoreProductRead.model_validate(store_product) if store_product else None,
                price_offers=price_offers,
            )

        if result.status in (ResolutionStatus.STORE_MATCH, ResolutionStatus.GLOBAL_MATCH):
            product = result.product
            assert product is not None and result.barcode is not None
            brand_name = None
            if product.brand_id is not None:
                brand = await self.brands.get_by_id(product.brand_id)
                brand_name = brand.name if brand else None

            price_offers = await self._build_price_offers(product.id)
            store_product = result.store_product
            if store_product is None and price_offers:
                store_product = await self.engine.store_products.get_by_id(price_offers[0].store_product_id)

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
                store_product=StoreProductRead.model_validate(store_product) if store_product else None,
                price_offers=price_offers,
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

    async def _build_price_offers(self, product_id: int) -> list[ScanPriceOfferRead]:
        store_products = await self.engine.store_products.list_by_product(product_id)
        if not store_products:
            return []

        store_products = sorted(
            store_products,
            key=lambda item: (
                float(item.current_price),
                item.last_verified_at.isoformat() if item.last_verified_at else "",
                item.id,
            ),
        )[:6]
        branch_ids = [store_product.store_branch_id for store_product in store_products]
        branches = await self.store_branches.list_by_ids(branch_ids)
        branches_by_id = {branch.id: branch for branch in branches}

        offers: list[ScanPriceOfferRead] = []
        for store_product in store_products:
            branch = branches_by_id.get(store_product.store_branch_id)
            store = branch.store if branch else None
            offers.append(
                ScanPriceOfferRead(
                    store_product_id=store_product.id,
                    store_branch_id=store_product.store_branch_id,
                    store_name=store.name if store else '',
                    store_branch_name=branch.name if branch else '',
                    current_price=store_product.current_price,
                    currency=store_product.currency,
                    availability=store_product.availability,
                    last_verified_at=store_product.last_verified_at,
                )
            )
        return offers

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
        store_id = request.store_id
        country = request.country
        if request.store_branch_id is not None:
            branch = await self.store_branches.get_by_id(request.store_branch_id)
            if branch is None:
                raise StoreBranchNotFound(request.store_branch_id)
            await self.engine.db.refresh(branch, ["store"])
            store_id = branch.store_id
            country = branch.store.country
            if request.tax_rate_id is not None:
                tax_rate = await self.tax_rates.get_by_id(request.tax_rate_id)
                if tax_rate is None or not tax_rate.is_active or tax_rate.country != country:
                    raise ValueError("tax_rate_id is not active for this store's country")
        return await self.engine.create_new_product(
            canonical_name=request.canonical_name,
            brand_id=request.brand_id,
            brand_name=request.brand_name,
            category_id=request.category_id,
            presentation=request.presentation,
            image_url=request.image_url,
            barcode=request.barcode,
            barcode_type=request.barcode_type,
            store_id=store_id,
            country=country,
            store_branch_id=request.store_branch_id,
            initial_price=request.initial_price,
            tax_rate_id=request.tax_rate_id,
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
