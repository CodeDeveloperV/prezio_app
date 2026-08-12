from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.features.catalog.models import Product
from app.features.catalog.repository import ProductRepository
from app.features.comparison.enums import ProductComparisonStatus
from app.features.comparison.exceptions import EmptyShoppingList, NoCandidateBranches
from app.features.comparison.schemas import (
    BranchComparisonResult,
    ProductComparisonLine,
    ShoppingListComparisonResult,
)
from app.features.pricing.enums import Availability
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository
from app.features.shopping_lists.exceptions import ShoppingListAccessDenied, ShoppingListNotFound
from app.features.shopping_lists.models import ShoppingListItem
from app.features.shopping_lists.repository import ShoppingListItemRepository, ShoppingListRepository
from app.features.stores.models import StoreBranch
from app.features.stores.repository import StoreBranchRepository

UNAVAILABLE_STOCK_STATES = {Availability.OUT_OF_STOCK, Availability.DISCONTINUED}


class ComparisonService:
    """Computes "how much would my whole list cost at each nearby branch" -- one independent
    total per branch (see `_compare_branch`).

    Deliberately NOT a greedy cross-store optimizer: mixing the cheapest per-product picks
    from different chains into a single total answers a different question ("what's the
    absolute minimum I could pay if I visited N different stores"), which needs its own
    "Optimizar compra" mode with its own UX (splitting a list across stops) -- out of scope
    here. The natural extension point for that mode is a sibling method on this service (e.g.
    `optimize_purchase`) that reuses `_resolve_line_status` per (branch, product) pair but
    picks the cheapest AVAILABLE branch per line instead of totalling one branch at a time.
    """

    def __init__(
        self,
        shopping_lists: ShoppingListRepository,
        shopping_list_items: ShoppingListItemRepository,
        products: ProductRepository,
        store_branches: StoreBranchRepository,
        store_products: StoreProductRepository,
        *,
        min_coverage: float,
        min_fresh_coverage: float,
        price_freshness_days: int,
    ) -> None:
        self.shopping_lists = shopping_lists
        self.shopping_list_items = shopping_list_items
        self.products = products
        self.store_branches = store_branches
        self.store_products = store_products
        self.min_coverage = min_coverage
        self.min_fresh_coverage = min_fresh_coverage
        self.price_freshness_days = price_freshness_days

    async def compare_shopping_list(
        self,
        shopping_list_id: int,
        requesting_user_id: int,
        *,
        city: str | None = None,
        store_branch_ids: list[int] | None = None,
    ) -> ShoppingListComparisonResult:
        shopping_list = await self.shopping_lists.get_by_id(shopping_list_id)
        if shopping_list is None:
            raise ShoppingListNotFound(shopping_list_id)
        if shopping_list.owner_user_id != requesting_user_id:
            raise ShoppingListAccessDenied(shopping_list_id)

        items = await self.shopping_list_items.list_by_shopping_list(shopping_list_id)
        if not items:
            raise EmptyShoppingList(shopping_list_id)

        branches = await self._find_candidate_branches(city=city, store_branch_ids=store_branch_ids)
        if not branches:
            raise NoCandidateBranches(city, store_branch_ids)

        product_ids = [item.product_id for item in items]
        products_by_id = {product.id: product for product in await self.products.list_by_ids(product_ids)}

        branch_ids = [branch.id for branch in branches]
        store_products = await self.store_products.list_by_branches_and_products(branch_ids, product_ids)
        store_products_by_branch_and_product: dict[tuple[int, int], StoreProduct] = {
            (sp.store_branch_id, sp.product_id): sp for sp in store_products
        }

        freshness_cutoff = datetime.now(timezone.utc) - timedelta(days=self.price_freshness_days)

        results = [
            self._compare_branch(branch, items, products_by_id, store_products_by_branch_and_product, freshness_cutoff)
            for branch in branches
        ]

        comparable_results = [result for result in results if result.comparable]
        cheapest = min(comparable_results, key=lambda result: result.total, default=None)
        most_expensive = max(comparable_results, key=lambda result: result.total, default=None)

        for result in results:
            if result.comparable and most_expensive is not None and len(comparable_results) >= 2:
                result.savings_vs_most_expensive = most_expensive.total - result.total

        # Requires two *distinct* comparable branches -- with only one, "savings" would just
        # be a meaningless $0.00 against itself rather than a real alternative.
        estimated_savings = (
            most_expensive.total - cheapest.total if len(comparable_results) >= 2 else None
        )

        results.sort(key=lambda result: (not result.comparable, result.total))

        return ShoppingListComparisonResult(
            shopping_list_id=shopping_list_id,
            min_coverage_threshold=self.min_coverage,
            min_fresh_coverage_threshold=self.min_fresh_coverage,
            results=results,
            cheapest_comparable_branch_id=cheapest.store_branch_id if cheapest else None,
            most_expensive_comparable_branch_id=most_expensive.store_branch_id if most_expensive else None,
            estimated_savings=estimated_savings,
        )

    async def _find_candidate_branches(
        self, *, city: str | None, store_branch_ids: list[int] | None
    ) -> list[StoreBranch]:
        # Explicit branch selection is the more specific signal, so it wins over `city` when
        # both are given rather than intersecting them -- avoids surprising empty results if
        # a caller passes a stale/mismatched city alongside its branch picks.
        if store_branch_ids:
            return await self.store_branches.list_by_ids(store_branch_ids)
        if city:
            return await self.store_branches.list_by_city(city)
        return []

    def _compare_branch(
        self,
        branch: StoreBranch,
        items: list[ShoppingListItem],
        products_by_id: dict[int, Product],
        store_products_by_branch_and_product: dict[tuple[int, int], StoreProduct],
        freshness_cutoff: datetime,
    ) -> BranchComparisonResult:
        lines: list[ProductComparisonLine] = []
        total = Decimal("0")
        currency = "USD"
        found = missing = price_unavailable = stale = unavailable = 0

        for item in items:
            product = products_by_id.get(item.product_id)
            product_name = product.canonical_name if product is not None else "Producto desconocido"
            store_product = store_products_by_branch_and_product.get((branch.id, item.product_id))

            status = self._resolve_line_status(store_product, freshness_cutoff)
            unit_price: Decimal | None = None
            subtotal: Decimal | None = None

            if status is ProductComparisonStatus.MISSING_PRODUCT:
                missing += 1
            elif status is ProductComparisonStatus.PRICE_UNAVAILABLE:
                price_unavailable += 1
            elif status is ProductComparisonStatus.UNAVAILABLE:
                unavailable += 1
            else:
                # AVAILABLE and STALE_PRICE both carry a usable price -- staleness lowers
                # confidence in the branch total (see `coverage_percentage`) but the price
                # itself is still the best known estimate, so it's still added to `total`.
                assert store_product is not None
                unit_price = store_product.current_price
                subtotal = unit_price * item.quantity
                total += subtotal
                currency = store_product.currency
                if status is ProductComparisonStatus.STALE_PRICE:
                    stale += 1
                else:
                    found += 1

            lines.append(
                ProductComparisonLine(
                    product_id=item.product_id,
                    product_name=product_name,
                    quantity=item.quantity,
                    status=status,
                    unit_price=unit_price,
                    subtotal=subtotal,
                )
            )

        total_known = len(items)
        # Usable coverage counts AVAILABLE and STALE_PRICE alike -- both carry a real price.
        # Fresh coverage is stricter and only counts AVAILABLE, so a branch propped up entirely
        # by stale prices can clear one threshold without clearing the other.
        coverage_percentage = (found + stale) / total_known if total_known else 0.0
        fresh_coverage_percentage = found / total_known if total_known else 0.0
        comparable = coverage_percentage >= self.min_coverage and fresh_coverage_percentage >= self.min_fresh_coverage

        return BranchComparisonResult(
            store_branch_id=branch.id,
            store_id=branch.store_id,
            store_name=branch.store.name,
            branch_name=branch.name,
            city=branch.city,
            currency=currency,
            total=total,
            total_known=total_known,
            found_products_count=found,
            missing_products_count=missing,
            price_unavailable_count=price_unavailable,
            stale_prices_count=stale,
            unavailable_products_count=unavailable,
            coverage_percentage=coverage_percentage,
            fresh_coverage_percentage=fresh_coverage_percentage,
            has_stale_prices=stale > 0,
            comparable=comparable,
            savings_vs_most_expensive=None,
            lines=lines,
        )

    def _resolve_line_status(
        self, store_product: StoreProduct | None, freshness_cutoff: datetime
    ) -> ProductComparisonStatus:
        """Product identity for this whole engine is `Product`/`StoreProduct` only --
        `ProductBarcode` never enters this resolution, so different barcodes pointing at the
        same `Product` can never affect the comparison."""
        if store_product is None:
            return ProductComparisonStatus.MISSING_PRODUCT
        if store_product.current_price is None or store_product.current_price <= 0:
            return ProductComparisonStatus.PRICE_UNAVAILABLE
        if store_product.availability in UNAVAILABLE_STOCK_STATES:
            return ProductComparisonStatus.UNAVAILABLE

        last_verified_at = store_product.last_verified_at
        if last_verified_at is None:
            return ProductComparisonStatus.STALE_PRICE
        # SQLite (used in tests) drops tzinfo on read-back even for a `DateTime(timezone=True)`
        # column -- same fixup as `SessionRepository.is_valid` -- so this stays comparable to
        # `freshness_cutoff`, which is always timezone-aware.
        if last_verified_at.tzinfo is None:
            last_verified_at = last_verified_at.replace(tzinfo=timezone.utc)
        if last_verified_at < freshness_cutoff:
            return ProductComparisonStatus.STALE_PRICE
        return ProductComparisonStatus.AVAILABLE
