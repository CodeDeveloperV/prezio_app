from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.repository import ProductRepository
from app.features.catalog.service import CatalogService
from app.features.organizations.exceptions import BranchAccessDenied, InvalidBranchForOrganization, ListingNotActive
from app.features.organizations.models import OrganizationMember
from app.features.organizations.pricing_schemas import (
    B2BBatchFailedItem,
    B2BBatchUpdateRequest,
    B2BBatchUpdateResponse,
    B2BPriceConflictRead,
    B2BPriceUpdateRequest,
    PricingListItemRead,
)
from app.features.organizations.service import OrganizationMembershipService
from app.features.pricing.enums import Availability, PriceUpdateSource, StoreProductStatus
from app.features.pricing.exceptions import PriceVersionConflict, StoreProductNotFound
from app.features.pricing.models import PriceHistory, StoreProduct
from app.features.pricing.repository import PriceHistoryRepository, StoreProductRepository
from app.features.pricing.schemas import PriceHistoryRead, PriceHistoryUpdatedByRead
from app.features.pricing.service import PricingService
from app.features.stores.models import StoreBranch
from app.features.stores.schemas import StoreBranchRead
from app.shared.enums import ModerationStatus


class B2BPricingService:
    """Price/availability management for StoreProducts already listed at the organization's
    branches (Fase 10.6). Never creates, reactivates, or deactivates a listing -- that's
    Fase 10.5's `B2BCatalogService`; a not-yet-listed product must go through "Catálogo ->
    Agregar a sucursal" before it can appear here.

    Reuses `PricingService.apply_update` for the actual optimistic-concurrency write and
    PriceHistory bookkeeping, always with `source=MERCHANT` and no reputation award -- staff
    doing their job shouldn't gain crowdsourced-trust points (see `PricingService.update_price`
    for the community/mobile counterpart, which still awards reputation).
    """

    def __init__(
        self,
        db: AsyncSession,
        pricing: PricingService,
        membership: OrganizationMembershipService,
        store_products: StoreProductRepository,
        price_history: PriceHistoryRepository,
        products: ProductRepository,
        catalog: CatalogService,
    ) -> None:
        self.db = db
        self.pricing = pricing
        self.membership = membership
        self.store_products = store_products
        self.price_history = price_history
        self.products = products
        self.catalog = catalog

    async def list_pricing(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        branch_id: int | None = None,
        category_id: int | None = None,
        availability: Availability | None = None,
        name: str | None = None,
        barcode: str | None = None,
        stale_before: datetime | None = None,
        include_inactive: bool = False,
    ) -> list[PricingListItemRead]:
        branches = await self.membership.list_branches(store_id, member)
        if branch_id is not None:
            await self.membership.authorize_branch(store_id, member, branch_id)
            branches = [b for b in branches if b.id == branch_id]
        branch_ids = [b.id for b in branches]

        product_ids: list[int] | None = None
        if name or barcode or category_id is not None:
            matching_products = await self.catalog.filter_products(
                name=name, barcode=barcode, category_id=category_id, brand_id=None, status=None
            )
            product_ids = [p.id for p in matching_products]

        listings = await self.store_products.list_by_branches(
            branch_ids,
            status=None if include_inactive else StoreProductStatus.ACTIVE,
            availability=availability,
            product_ids=product_ids,
            stale_before=stale_before,
        )
        return await self._to_list_items(listings, branches)

    async def get_history(
        self, store_id: int, member: OrganizationMember, store_product_id: int
    ) -> list[PriceHistoryRead]:
        listing = await self.store_products.get_by_id(store_product_id)
        if listing is None:
            raise StoreProductNotFound(store_product_id)
        await self.membership.authorize_branch(store_id, member, listing.store_branch_id)
        return await self.pricing.list_price_history(store_product_id)

    async def update_store_product(
        self,
        store_id: int,
        member: OrganizationMember,
        store_product_id: int,
        payload: B2BPriceUpdateRequest,
        changed_by_user_id: int,
    ) -> PricingListItemRead:
        listing = await self.store_products.get_by_id(store_product_id)
        if listing is None:
            raise StoreProductNotFound(store_product_id)
        branch = await self.membership.authorize_branch(store_id, member, listing.store_branch_id)
        if listing.status != StoreProductStatus.ACTIVE:
            raise ListingNotActive(store_product_id)

        updated = await self.pricing.apply_update(
            store_product_id,
            price=payload.price,
            availability=payload.availability,
            expected_version=payload.version,
            changed_by_user_id=changed_by_user_id,
            source=PriceUpdateSource.MERCHANT,
            award_reputation=False,
        )
        return await self._reload_item(updated.id, branch)

    async def batch_update(
        self,
        store_id: int,
        member: OrganizationMember,
        payload: B2BBatchUpdateRequest,
        changed_by_user_id: int,
    ) -> B2BBatchUpdateResponse:
        """Each item is authorized and applied independently -- one stale/forbidden/inactive
        item never blocks the rest, and a StoreProduct outside this org/branch scope is
        rejected per-item (`failed`) rather than silently skipped or allowed through."""
        listings_by_id = {
            listing.id: listing
            for listing in await self.store_products.list_by_ids([item.store_product_id for item in payload.items])
        }

        updated: list[PricingListItemRead] = []
        conflicts: list[B2BPriceConflictRead] = []
        failed: list[B2BBatchFailedItem] = []

        for item in payload.items:
            listing = listings_by_id.get(item.store_product_id)
            if listing is None:
                failed.append(B2BBatchFailedItem(store_product_id=item.store_product_id, error="not_found"))
                continue

            try:
                branch = await self.membership.authorize_branch(store_id, member, listing.store_branch_id)
            except (InvalidBranchForOrganization, BranchAccessDenied):
                failed.append(B2BBatchFailedItem(store_product_id=item.store_product_id, error="forbidden"))
                continue

            if listing.status != StoreProductStatus.ACTIVE:
                failed.append(B2BBatchFailedItem(store_product_id=item.store_product_id, error="listing_not_active"))
                continue

            try:
                await self.pricing.apply_update(
                    item.store_product_id,
                    price=item.price,
                    availability=item.availability,
                    expected_version=item.version,
                    changed_by_user_id=changed_by_user_id,
                    source=PriceUpdateSource.MERCHANT,
                    award_reputation=False,
                )
            except PriceVersionConflict as exc:
                conflicts.append(
                    B2BPriceConflictRead(
                        store_product_id=item.store_product_id,
                        submitted_price=item.price,
                        submitted_availability=item.availability,
                        submitted_version=item.version,
                        current_price=exc.current_price,
                        current_availability=exc.current_availability,
                        current_version=exc.current_version,
                    )
                )
                continue
            except StoreProductNotFound:
                failed.append(B2BBatchFailedItem(store_product_id=item.store_product_id, error="not_found"))
                continue

            updated.append(await self._reload_item(item.store_product_id, branch))

        return B2BBatchUpdateResponse(updated=updated, conflicts=conflicts, failed=failed)

    async def _reload_item(
        self, store_product_id: int, branch: StoreBranch | StoreBranchRead
    ) -> PricingListItemRead:
        listing = await self.store_products.get_by_id(store_product_id)
        assert listing is not None
        product = await self.products.get_with_relations(listing.product_id)
        assert product is not None
        latest_history = await self.price_history.list_latest_by_store_products([store_product_id])
        return self._to_item(listing, branch, product, latest_history.get(store_product_id))

    async def _to_list_items(
        self, listings: list[StoreProduct], branches: list[StoreBranchRead]
    ) -> list[PricingListItemRead]:
        if not listings:
            return []
        branch_by_id = {b.id: b for b in branches}
        products = await self.products.list_by_ids_with_relations([listing.product_id for listing in listings])
        product_by_id = {p.id: p for p in products}
        latest_history = await self.price_history.list_latest_by_store_products([listing.id for listing in listings])

        items = []
        for listing in listings:
            branch = branch_by_id.get(listing.store_branch_id)
            product = product_by_id.get(listing.product_id)
            if branch is None or product is None:
                continue
            items.append(self._to_item(listing, branch, product, latest_history.get(listing.id)))
        return items

    def _to_item(
        self,
        listing: StoreProduct,
        branch: StoreBranch | StoreBranchRead,
        product,
        history: PriceHistory | None,
    ) -> PricingListItemRead:
        updated_by = None
        if history is not None and history.updated_by_user is not None:
            user = history.updated_by_user
            display_name = user.profile.display_name.strip() if user.profile and user.profile.display_name else ""
            updated_by = PriceHistoryUpdatedByRead(
                user_id=user.id,
                display_name=display_name or None,
                email=user.email,
            )

        return PricingListItemRead(
            store_product_id=listing.id,
            branch_id=branch.id,
            branch_name=branch.name,
            product_id=product.id,
            canonical_name=product.canonical_name,
            brand_name=product.brand.name if product.brand else None,
            presentation=product.presentation,
            category_name=product.category.name if product.category else None,
            barcode=self._representative_barcode(product),
            image_url=product.image_url,
            current_price=listing.current_price,
            previous_price=history.previous_price if history else None,
            currency=listing.currency,
            availability=listing.availability,
            listing_status=listing.status,
            version=listing.version,
            last_verified_at=listing.last_verified_at,
            updated_at=listing.updated_at,
            last_updated_by=updated_by,
            last_update_source=history.source if history else None,
        )

    def _representative_barcode(self, product) -> str | None:
        return next((b.barcode for b in product.barcodes if b.status != ModerationStatus.REJECTED), None)
