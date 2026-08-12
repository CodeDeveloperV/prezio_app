from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.models import Product, ProductAlias, ProductBarcode
from app.features.catalog.repository import ProductAliasRepository, ProductBarcodeRepository, ProductRepository
from app.features.moderation.exceptions import (
    AliasNotFound,
    AlreadyReviewed,
    BarcodeNotFound,
    InvalidMergeRequest,
    ProductMergeNotFound,
)
from app.features.moderation.merge_engine import execute_product_merge
from app.features.moderation.models import ProductMerge
from app.features.moderation.repository import ProductMergeRepository
from app.features.pricing.repository import (
    PriceConfirmationRepository,
    PriceHistoryRepository,
    StoreProductRepository,
)
from app.features.reputation.enums import ReputationAction
from app.features.reputation.service import ReputationService
from app.shared.enums import ModerationStatus


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ModerationService:
    """Collaborative moderation for the catalog: reviewing pending Products/Barcodes/Aliases and
    resolving duplicate-Product merges, all under a uniform PENDING/APPROVED/REJECTED/MERGED
    lifecycle."""

    def __init__(
        self,
        db: AsyncSession,
        products: ProductRepository,
        barcodes: ProductBarcodeRepository,
        aliases: ProductAliasRepository,
        merges: ProductMergeRepository,
        store_products: StoreProductRepository,
        price_history: PriceHistoryRepository,
        price_confirmations: PriceConfirmationRepository,
        reputation: ReputationService,
    ) -> None:
        self.db = db
        self.products = products
        self.barcodes = barcodes
        self.aliases = aliases
        self.merges = merges
        self.store_products = store_products
        self.price_history = price_history
        self.price_confirmations = price_confirmations
        self.reputation = reputation

    # --- queues -----------------------------------------------------------------

    async def list_products(self, status: ModerationStatus) -> list[Product]:
        return await self.products.list_by_status(status)

    async def list_barcodes(self, status: ModerationStatus) -> list[ProductBarcode]:
        return await self.barcodes.list_by_status(status)

    async def list_aliases(self, status: ModerationStatus) -> list[ProductAlias]:
        return await self.aliases.list_by_status(status)

    async def list_merges(self, status: ModerationStatus) -> list[ProductMerge]:
        return await self.merges.list_by_status(status)

    # --- products -----------------------------------------------------------------

    async def approve_product(self, product_id: int, moderator_id: int) -> Product:
        product = await self._get_pending_product(product_id)
        product.status = ModerationStatus.APPROVED
        product.reviewed_by = moderator_id
        product.reviewed_at = _utcnow()
        if product.created_by is not None:
            await self.reputation.award(
                user_id=product.created_by,
                action=ReputationAction.CREATE_PRODUCT_APPROVED,
                reference_type="product",
                reference_id=product.id,
            )
        await self.db.commit()
        # `updated_at` is a server-computed onupdate column -- refresh so the ORM instance
        # reflects the value the DB just generated instead of leaving it expired.
        await self.db.refresh(product)
        return product

    async def reject_product(self, product_id: int, moderator_id: int) -> Product:
        product = await self._get_pending_product(product_id)
        product.status = ModerationStatus.REJECTED
        product.reviewed_by = moderator_id
        product.reviewed_at = _utcnow()
        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def _get_pending_product(self, product_id: int) -> Product:
        product = await self.products.get_by_id(product_id)
        if product is None:
            raise ProductNotFound(product_id)
        if product.status != ModerationStatus.PENDING:
            raise AlreadyReviewed(f"Product {product_id} is already {product.status.value}")
        return product

    # --- barcodes -----------------------------------------------------------------

    async def approve_barcode(self, barcode_id: int, moderator_id: int) -> ProductBarcode:
        barcode = await self._get_pending_barcode(barcode_id)
        barcode.status = ModerationStatus.APPROVED
        barcode.reviewed_by = moderator_id
        barcode.reviewed_at = _utcnow()
        await self.db.commit()
        return barcode

    async def reject_barcode(self, barcode_id: int, moderator_id: int) -> ProductBarcode:
        barcode = await self._get_pending_barcode(barcode_id)
        barcode.status = ModerationStatus.REJECTED
        barcode.reviewed_by = moderator_id
        barcode.reviewed_at = _utcnow()
        await self.db.commit()
        return barcode

    async def move_barcode(self, barcode_id: int, target_product_id: int, moderator_id: int) -> ProductBarcode:
        """Reassigns a misfiled ProductBarcode to the correct Product (e.g. it was attached to
        the wrong disambiguation candidate)."""
        barcode = await self.barcodes.get_by_id(barcode_id)
        if barcode is None:
            raise BarcodeNotFound(barcode_id)
        target = await self.products.get_by_id(target_product_id)
        if target is None:
            raise ProductNotFound(target_product_id)

        barcode.product_id = target_product_id
        barcode.reviewed_by = moderator_id
        barcode.reviewed_at = _utcnow()
        await self.db.commit()
        return barcode

    async def _get_pending_barcode(self, barcode_id: int) -> ProductBarcode:
        barcode = await self.barcodes.get_by_id(barcode_id)
        if barcode is None:
            raise BarcodeNotFound(barcode_id)
        if barcode.status != ModerationStatus.PENDING:
            raise AlreadyReviewed(f"Barcode {barcode_id} is already {barcode.status.value}")
        return barcode

    # --- aliases -----------------------------------------------------------------

    async def approve_alias(self, alias_id: int, moderator_id: int) -> ProductAlias:
        alias = await self._get_pending_alias(alias_id)
        alias.status = ModerationStatus.APPROVED
        alias.reviewed_by = moderator_id
        alias.reviewed_at = _utcnow()
        await self.db.commit()
        return alias

    async def reject_alias(self, alias_id: int, moderator_id: int) -> ProductAlias:
        alias = await self._get_pending_alias(alias_id)
        alias.status = ModerationStatus.REJECTED
        alias.reviewed_by = moderator_id
        alias.reviewed_at = _utcnow()
        await self.db.commit()
        return alias

    async def move_alias(self, alias_id: int, target_product_id: int, moderator_id: int) -> ProductAlias:
        """Reassigns a misfiled ProductAlias to the correct Product. If the target already has
        an identical (alias, language) row, the duplicate is discarded instead -- it was truly
        redundant, and no information is lost by removing it."""
        alias = await self.aliases.get_by_id(alias_id)
        if alias is None:
            raise AliasNotFound(alias_id)
        target = await self.products.get_by_id(target_product_id)
        if target is None:
            raise ProductNotFound(target_product_id)

        conflict = await self.aliases.find_conflict(target_product_id, alias.alias, alias.language)
        if conflict is not None:
            await self.aliases.delete(alias)
            await self.db.commit()
            return conflict

        alias.product_id = target_product_id
        alias.reviewed_by = moderator_id
        alias.reviewed_at = _utcnow()
        await self.db.commit()
        return alias

    async def _get_pending_alias(self, alias_id: int) -> ProductAlias:
        alias = await self.aliases.get_by_id(alias_id)
        if alias is None:
            raise AliasNotFound(alias_id)
        if alias.status != ModerationStatus.PENDING:
            raise AlreadyReviewed(f"Alias {alias_id} is already {alias.status.value}")
        return alias

    # --- product merges -----------------------------------------------------------------

    async def propose_merge(
        self, source_product_id: int, target_product_id: int, reason: str | None, proposed_by: int
    ) -> ProductMerge:
        if source_product_id == target_product_id:
            raise InvalidMergeRequest("A product cannot be merged into itself")

        source = await self.products.get_by_id(source_product_id)
        if source is None:
            raise ProductNotFound(source_product_id)
        target = await self.products.get_by_id(target_product_id)
        if target is None:
            raise ProductNotFound(target_product_id)
        if source.status == ModerationStatus.MERGED:
            raise InvalidMergeRequest(f"Product {source_product_id} was already merged elsewhere")

        merge = await self.merges.add(
            ProductMerge(
                source_product_id=source_product_id,
                target_product_id=target_product_id,
                reason=reason,
                proposed_by=proposed_by,
            )
        )
        await self.db.commit()
        return merge

    async def approve_merge(self, merge_id: int, moderator_id: int) -> ProductMerge:
        """Executes the merge: migrates barcodes/aliases/prices/history from source to target
        (see `merge_engine.execute_product_merge`) and marks the source Product MERGED."""
        merge = await self._get_pending_merge(merge_id)
        source = await self.products.get_by_id(merge.source_product_id)
        target = await self.products.get_by_id(merge.target_product_id)
        if source is None:
            raise ProductNotFound(merge.source_product_id)
        if target is None:
            raise ProductNotFound(merge.target_product_id)

        await execute_product_merge(
            self.db,
            source=source,
            target=target,
            barcodes=self.barcodes,
            aliases=self.aliases,
            store_products=self.store_products,
            price_history=self.price_history,
            price_confirmations=self.price_confirmations,
            moderator_id=moderator_id,
        )

        merge.status = ModerationStatus.APPROVED
        merge.reviewed_by = moderator_id
        merge.reviewed_at = _utcnow()
        if merge.proposed_by is not None:
            await self.reputation.award(
                user_id=merge.proposed_by,
                action=ReputationAction.REPORT_DUPLICATE_APPROVED,
                reference_type="product_merge",
                reference_id=merge.id,
            )
        await self.db.commit()
        return merge

    async def reject_merge(self, merge_id: int, moderator_id: int) -> ProductMerge:
        merge = await self._get_pending_merge(merge_id)
        merge.status = ModerationStatus.REJECTED
        merge.reviewed_by = moderator_id
        merge.reviewed_at = _utcnow()
        await self.db.commit()
        return merge

    async def _get_pending_merge(self, merge_id: int) -> ProductMerge:
        merge = await self.merges.get_by_id(merge_id)
        if merge is None:
            raise ProductMergeNotFound(merge_id)
        if merge.status != ModerationStatus.PENDING:
            raise AlreadyReviewed(f"Merge {merge_id} is already {merge.status.value}")
        return merge
