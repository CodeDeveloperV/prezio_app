"""Centralizes "what Product does this scan represent?" -- the question the mobile scanner,
moderation tooling, and (eventually) an AI recognition provider all need answered the same way.

Domain rule this engine exists to enforce: a barcode is never assumed to identify exactly one
Product. The same barcode string can legitimately resolve to different products depending on
store/distributor/country (see `ProductBarcode.store_id` scoping), and a Product can be reached
through several different barcodes. `Product` is the canonical identity; `ProductBarcode` is one
known way to recognize it; `StoreProduct` is a separate concern (presence/price at a branch) that
may not exist yet even once the Product itself is resolved.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.enums import BarcodeSource, BarcodeType, RecognitionType
from app.features.catalog.exceptions import DuplicateBarcodeError, ProductNotFound
from app.features.catalog.matching import ScoredCandidate
from app.features.catalog.models import Product, ProductBarcode
from app.features.catalog.product_matching_service import ProductMatchingService
from app.features.catalog.repository import BrandRepository, ProductBarcodeRepository, ProductRepository
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository
from app.features.reputation.enums import ReputationAction
from app.features.reputation.service import ReputationService
from app.shared.enums import ModerationStatus


class ResolutionStatus(str, Enum):
    STORE_MATCH = "store_match"  # ProductBarcode scoped to this specific store matched.
    GLOBAL_MATCH = "global_match"  # store-agnostic (store_id IS NULL) ProductBarcode matched.
    POSSIBLE_MATCHES = "possible_matches"
    UNKNOWN = "unknown"
    CONFLICT = "conflict"


class ResolutionSource(str, Enum):
    STORE_BARCODE = "store_barcode"
    GLOBAL_BARCODE = "global_barcode"
    NAME_MATCHING = "name_matching"


@dataclass
class ResolutionResult:
    status: ResolutionStatus
    product: Product | None = None
    barcode: ProductBarcode | None = None
    store_product: StoreProduct | None = None
    candidates: list[ScoredCandidate] = field(default_factory=list)
    confidence: float = 0.0
    resolution_source: ResolutionSource | None = None
    requires_user_confirmation: bool = False
    warnings: list[str] = field(default_factory=list)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CatalogResolutionEngine:
    """Resolves `barcode + store context + optional hints` to a Product, and lets a caller turn
    a POSSIBLE_MATCHES/UNKNOWN outcome into a new ProductBarcode association (never silently
    creating a duplicate Product).
    """

    def __init__(
        self,
        db: AsyncSession,
        products: ProductRepository,
        barcodes: ProductBarcodeRepository,
        store_products: StoreProductRepository,
        brands: BrandRepository,
        matching: ProductMatchingService,
        reputation: ReputationService,
    ) -> None:
        self.db = db
        self.products = products
        self.barcodes = barcodes
        self.store_products = store_products
        self.brands = brands
        self.matching = matching
        self.reputation = reputation

    async def resolve(
        self,
        *,
        barcode: str,
        store_id: int,
        store_branch_id: int,
        name_hint: str | None = None,
        brand_id: int | None = None,
        category_id: int | None = None,
        presentation: str | None = None,
        image_url: str | None = None,
    ) -> ResolutionResult:
        rows = await self.barcodes.find_matches_for_lookup(barcode, store_id)

        store_row = next((row for row in rows if row.store_id == store_id), None)
        if store_row is not None:
            return await self._resolved(store_row, ResolutionSource.STORE_BARCODE, ResolutionStatus.STORE_MATCH, store_branch_id)

        global_rows = [row for row in rows if row.store_id is None]
        if global_rows:
            distinct_product_ids = {row.product_id for row in global_rows}
            if len(distinct_product_ids) > 1:
                candidate_products = [await self.products.get_by_id(pid) for pid in distinct_product_ids]
                return ResolutionResult(
                    status=ResolutionStatus.CONFLICT,
                    candidates=[
                        ScoredCandidate(product=p, score=0.0, matched_on=["conflicting_barcode"])
                        for p in candidate_products
                        if p is not None
                    ],
                    requires_user_confirmation=True,
                    warnings=[
                        f"Barcode '{barcode}' is registered globally to {len(distinct_product_ids)} "
                        "different products -- manual resolution required."
                    ],
                )
            return await self._resolved(global_rows[0], ResolutionSource.GLOBAL_BARCODE, ResolutionStatus.GLOBAL_MATCH, store_branch_id)

        ranked = await self.matching.find_candidates(
            name_hint=name_hint,
            brand_id=brand_id,
            presentation=presentation,
            category_id=category_id,
            image_url=image_url,
        )
        if ranked:
            return ResolutionResult(
                status=ResolutionStatus.POSSIBLE_MATCHES,
                candidates=ranked,
                confidence=ranked[0].score,
                resolution_source=ResolutionSource.NAME_MATCHING,
                requires_user_confirmation=True,
            )

        return ResolutionResult(status=ResolutionStatus.UNKNOWN, requires_user_confirmation=True)

    async def _resolved(
        self,
        barcode_row: ProductBarcode,
        source: ResolutionSource,
        status: ResolutionStatus,
        store_branch_id: int,
    ) -> ResolutionResult:
        product = await self.products.get_by_id(barcode_row.product_id)
        if product is None:
            raise ProductNotFound(barcode_row.product_id)

        # Resolving the Product does not imply a StoreProduct exists at this branch -- that's a
        # separate, pricing-owned concern (see StoreProduct) that this engine never invents.
        store_product = await self.store_products.get_by_branch_and_product(store_branch_id, product.id)
        warnings = [] if store_product is not None else ["No price registered for this product at this branch yet."]

        return ResolutionResult(
            status=status,
            product=product,
            barcode=barcode_row,
            store_product=store_product,
            confidence=1.0,
            resolution_source=source,
            warnings=warnings,
        )

    async def confirm_candidate(
        self,
        *,
        product_id: int,
        barcode: str,
        barcode_type: BarcodeType,
        store_id: int | None,
        country: str | None,
        created_by: int,
    ) -> ProductBarcode:
        """User confirmed a POSSIBLE_MATCHES candidate (or is manually resolving a CONFLICT):
        only a new ProductBarcode is created -- the Product itself is never touched. Idempotent:
        re-confirming the exact same (product, barcode, store) association returns the existing
        row instead of erroring or creating a duplicate.
        """
        product = await self.products.get_by_id(product_id)
        if product is None:
            raise ProductNotFound(product_id)

        existing = await self.barcodes.find_conflict(product_id, barcode, store_id)
        if existing is not None:
            return existing

        row = ProductBarcode(
            product_id=product_id,
            barcode=barcode,
            barcode_type=barcode_type,
            store_id=store_id,
            country=country,
            source=BarcodeSource.USER_SCAN,
            confidence=1.0,
            status=ModerationStatus.PENDING,
            created_by=created_by,
        )
        try:
            row = await self.barcodes.add(row)
        except IntegrityError as exc:
            await self.db.rollback()
            raise DuplicateBarcodeError(barcode) from exc

        await self.db.commit()
        return row

    async def create_new_product(
        self,
        *,
        canonical_name: str,
        brand_id: int | None,
        brand_name: str | None,
        category_id: int,
        presentation: str | None,
        image_url: str,
        barcode: str,
        barcode_type: BarcodeType,
        store_id: int | None,
        country: str | None,
        created_by: int,
    ) -> Product:
        """Only reached once the engine has already returned UNKNOWN (or the user rejected
        every POSSIBLE_MATCHES candidate): creates a new Product and attaches the scanned barcode
        to it. Attaching is idempotent for the same reasons as `confirm_candidate`.

        A sufficiently reputable contributor's product skips the PENDING moderation queue
        entirely (see `ReputationService.qualifies_for_auto_approval`) -- everyone else's still
        needs a moderator to approve it before it earns `CREATE_PRODUCT_APPROVED` points.
        """
        resolved_brand_id = brand_id
        if resolved_brand_id is None and brand_name:
            brand = await self.brands.get_or_create_by_name(brand_name)
            resolved_brand_id = brand.id

        auto_approved = await self.reputation.qualifies_for_auto_approval(created_by)

        product = await self.products.add(
            Product(
                canonical_name=canonical_name,
                brand_id=resolved_brand_id,
                category_id=category_id,
                presentation=presentation,
                image_url=image_url,
                # Always MANUAL for now -- a future flow where the user confirms an
                # AI-extracted suggestion (see image_extraction_provider.py) would pass
                # RecognitionType.IMAGE here instead.
                recognition_type=RecognitionType.MANUAL,
                status=ModerationStatus.APPROVED if auto_approved else ModerationStatus.PENDING,
                reviewed_at=_utcnow() if auto_approved else None,
                created_by=created_by,
            )
        )

        if auto_approved:
            await self.reputation.award(
                user_id=created_by,
                action=ReputationAction.CREATE_PRODUCT_APPROVED,
                reference_type="product",
                reference_id=product.id,
            )

        existing = await self.barcodes.find_conflict(product.id, barcode, store_id)
        if existing is None:
            row = ProductBarcode(
                product_id=product.id,
                barcode=barcode,
                barcode_type=barcode_type,
                store_id=store_id,
                country=country,
                source=BarcodeSource.USER_SCAN,
                confidence=1.0,
                status=ModerationStatus.PENDING,
                created_by=created_by,
            )
            try:
                await self.barcodes.add(row)
            except IntegrityError as exc:
                await self.db.rollback()
                raise DuplicateBarcodeError(barcode) from exc

        await self.db.commit()
        return product
