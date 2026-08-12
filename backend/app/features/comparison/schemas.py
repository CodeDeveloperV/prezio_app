from decimal import Decimal

from pydantic import BaseModel

from app.features.comparison.enums import ProductComparisonStatus


class CompareShoppingListRequest(BaseModel):
    """Geographic/selection context for the comparison -- at least one of the two must be
    given (see `NoCandidateBranches`). `store_branch_ids` wins over `city` when both are sent,
    since it's a more specific choice made by the user. Reserved for a future upgrade: once the
    app has geolocation, a `latitude`/`longitude` + `radius_km` pair can be added here without
    changing `city`/`store_branch_ids` -- see `ComparisonService.compare_shopping_list`."""

    city: str | None = None
    store_branch_ids: list[int] | None = None


class ProductComparisonLine(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    status: ProductComparisonStatus
    unit_price: Decimal | None
    subtotal: Decimal | None


class BranchComparisonResult(BaseModel):
    store_branch_id: int
    store_id: int
    store_name: str
    branch_name: str
    city: str
    currency: str
    total: Decimal
    total_known: int
    found_products_count: int
    missing_products_count: int
    price_unavailable_count: int
    stale_prices_count: int
    unavailable_products_count: int
    # Usable-price coverage: (found_products_count + stale_prices_count) / total_known --
    # AVAILABLE and STALE_PRICE both count, since a stale price still contributes to `total`.
    coverage_percentage: float
    # Fresh-price coverage: found_products_count / total_known -- STALE_PRICE does NOT count.
    # Stricter than coverage_percentage; a branch can clear one and not the other.
    fresh_coverage_percentage: float
    has_stale_prices: bool
    comparable: bool
    # None until compared against the most expensive comparable branch (needs >= 2 comparable
    # results); always 0 for the most expensive one itself.
    savings_vs_most_expensive: Decimal | None
    lines: list[ProductComparisonLine]


class ShoppingListComparisonResult(BaseModel):
    shopping_list_id: int
    min_coverage_threshold: float
    min_fresh_coverage_threshold: float
    # Sorted comparable-first, then by total ascending -- cheapest comparable option first.
    results: list[BranchComparisonResult]
    cheapest_comparable_branch_id: int | None
    most_expensive_comparable_branch_id: int | None
    # most_expensive_comparable.total - cheapest_comparable.total; None when fewer than two
    # branches are comparable (nothing meaningful to save against).
    estimated_savings: Decimal | None
