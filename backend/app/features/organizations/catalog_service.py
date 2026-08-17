from sqlalchemy.ext.asyncio import AsyncSession

from app.features.catalog.exceptions import ProductNotFound
from app.features.catalog.models import Product
from app.features.catalog.service import CatalogService
from app.features.organizations.catalog_schemas import (
    BranchListingRead,
    CatalogProductDetail,
    CatalogProductSummary,
    CreateListingRequest,
    OrgListingStatus,
    UpdateListingStatusRequest,
)
from app.features.organizations.models import OrganizationMember
from app.features.organizations.service import OrganizationMembershipService
from app.features.pricing.enums import StoreProductStatus
from app.features.pricing.exceptions import StoreProductNotFound
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository
from app.features.stores.models import StoreBranch
from app.shared.enums import ModerationStatus


class B2BCatalogService:
    """Read-only global catalog browsing plus per-branch listing management for the B2B
    portal. Never creates, edits, or moderates `Product` itself -- that stays exclusively a
    crowdsourced/mobile/moderation concern (see EPIC 10 Fase 10.5 spec). Price is only ever
    set once, at listing creation, to satisfy `StoreProduct.current_price`'s NOT NULL
    constraint -- price *updates* are entirely out of scope (Fase 10.6)."""

    def __init__(
        self,
        db: AsyncSession,
        catalog: CatalogService,
        membership: OrganizationMembershipService,
        store_products: StoreProductRepository,
    ) -> None:
        self.db = db
        self.catalog = catalog
        self.membership = membership
        self.store_products = store_products

    async def list_products(
        self,
        store_id: int,
        member: OrganizationMember,
        *,
        name: str | None = None,
        barcode: str | None = None,
        brand_id: int | None = None,
        category_id: int | None = None,
        status: ModerationStatus | None = None,
    ) -> list[CatalogProductSummary]:
        products = await self.catalog.filter_products(
            name=name, barcode=barcode, brand_id=brand_id, category_id=category_id, status=status
        )
        branch_ids = [b.id for b in await self.membership.list_branches(store_id, member)]
        listings = await self.store_products.list_by_branches_and_products(
            branch_ids, [p.id for p in products]
        )
        listings_by_product: dict[int, list[StoreProduct]] = {}
        for listing in listings:
            listings_by_product.setdefault(listing.product_id, []).append(listing)

        return [self._to_summary(product, listings_by_product.get(product.id, [])) for product in products]

    async def get_product(self, store_id: int, member: OrganizationMember, product_id: int) -> CatalogProductDetail:
        product = await self.catalog.get_product(product_id)
        branches = await self._branch_listings(store_id, member, product_id)
        return CatalogProductDetail(
            id=product.id,
            canonical_name=product.canonical_name,
            brand_name=product.brand.name if product.brand else None,
            presentation=product.presentation,
            category_name=product.category.name if product.category else None,
            barcode=self._representative_barcode(product),
            description=product.description,
            image_url=product.image_url,
            status=product.status,
            recognition_type=product.recognition_type,
            branches=branches,
        )

    async def list_branch_listings(
        self, store_id: int, member: OrganizationMember, product_id: int
    ) -> list[BranchListingRead]:
        await self.catalog.get_product(product_id)  # raises ProductNotFound if missing
        return await self._branch_listings(store_id, member, product_id)

    async def create_or_reactivate_listings(
        self, store_id: int, member: OrganizationMember, product_id: int, payload: CreateListingRequest
    ) -> list[BranchListingRead]:
        await self.catalog.get_product(product_id)  # raises ProductNotFound if missing

        for branch_id in payload.branch_ids:
            await self._authorize_branch(store_id, member, branch_id)
            existing = await self.store_products.get_by_branch_and_product(branch_id, product_id)
            if existing is None:
                await self.store_products.add(
                    StoreProduct(
                        store_branch_id=branch_id,
                        product_id=product_id,
                        current_price=payload.initial_price,
                        currency=payload.currency,
                    )
                )
            elif existing.status != StoreProductStatus.ACTIVE:
                existing.status = StoreProductStatus.ACTIVE

        await self.db.commit()
        return await self._branch_listings(store_id, member, product_id)

    async def update_listing_status(
        self,
        store_id: int,
        member: OrganizationMember,
        product_id: int,
        branch_id: int,
        payload: UpdateListingStatusRequest,
    ) -> BranchListingRead:
        await self.catalog.get_product(product_id)  # raises ProductNotFound if missing
        await self._authorize_branch(store_id, member, branch_id)

        listing = await self.store_products.get_by_branch_and_product(branch_id, product_id)
        if listing is None:
            raise StoreProductNotFound(product_id)

        listing.status = payload.status
        await self.db.commit()

        branches = await self.membership.store_branches.list_by_ids([branch_id])
        branch = branches[0]
        return self._to_branch_listing(branch, listing)

    async def _authorize_branch(self, store_id: int, member: OrganizationMember, branch_id: int) -> None:
        """Done per-branch here rather than via `require_branch_access` since callers pass
        multiple branch_ids in a request body, not a single path param."""
        await self.membership.authorize_branch(store_id, member, branch_id)

    async def _branch_listings(
        self, store_id: int, member: OrganizationMember, product_id: int
    ) -> list[BranchListingRead]:
        branches = await self.membership.list_branches(store_id, member)
        listings = await self.store_products.list_by_branches_and_products(
            [b.id for b in branches], [product_id]
        )
        listing_by_branch = {listing.store_branch_id: listing for listing in listings}
        return [self._to_branch_listing(branch, listing_by_branch.get(branch.id)) for branch in branches]

    def _to_branch_listing(self, branch: StoreBranch, listing: StoreProduct | None) -> BranchListingRead:
        if listing is None:
            return BranchListingRead(
                branch_id=branch.id,
                branch_name=branch.name,
                city=branch.city,
                status=OrgListingStatus.NOT_LISTED,
                store_product_id=None,
                current_price=None,
                currency=None,
            )
        return BranchListingRead(
            branch_id=branch.id,
            branch_name=branch.name,
            city=branch.city,
            status=OrgListingStatus(listing.status.value),
            store_product_id=listing.id,
            current_price=listing.current_price,
            currency=listing.currency,
        )

    def _to_summary(self, product: Product, listings: list[StoreProduct]) -> CatalogProductSummary:
        active_count = sum(1 for listing in listings if listing.status == StoreProductStatus.ACTIVE)
        if active_count > 0:
            org_status = OrgListingStatus.ACTIVE
        elif listings:
            org_status = OrgListingStatus.INACTIVE
        else:
            org_status = OrgListingStatus.NOT_LISTED

        return CatalogProductSummary(
            id=product.id,
            canonical_name=product.canonical_name,
            brand_name=product.brand.name if product.brand else None,
            presentation=product.presentation,
            category_name=product.category.name if product.category else None,
            barcode=self._representative_barcode(product),
            image_url=product.image_url,
            status=product.status,
            recognition_type=product.recognition_type,
            branches_listed_count=active_count,
            org_status=org_status,
        )

    def _representative_barcode(self, product: Product) -> str | None:
        """Picks one barcode to display for a Product that may have several -- the first
        non-rejected one, since a rejected barcode ("producto incorrecto") no longer identifies
        this product."""
        return next((b.barcode for b in product.barcodes if b.status != ModerationStatus.REJECTED), None)
