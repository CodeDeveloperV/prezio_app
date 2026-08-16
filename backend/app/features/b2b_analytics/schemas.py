from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class BranchCountRead(BaseModel):
    branch_id: int
    branch_name: str
    count: int


class TypeCountRead(BaseModel):
    type: str
    count: int


class CategoryCountRead(BaseModel):
    category_id: int
    category_name: str
    count: int


class OverviewRead(BaseModel):
    """Headline KPIs for `/dashboard`. `active_branches` counts branches with at least one
    ACTIVE StoreProduct listing -- `StoreBranch` has no status/active column of its own, so
    "active" is defined operationally rather than from a field that doesn't exist."""

    active_branches: int
    active_listings: int
    prices_updated: int
    prices_updated_previous_period: int | None
    stale_prices: int
    out_of_stock: int
    open_reports: int
    high_priority_open_reports: int
    active_promotions: int
    active_coupons: int


class PriceTimeSeriesPointRead(BaseModel):
    bucket_start: datetime
    changes_count: int
    increases_count: int
    decreases_count: int


class TopPriceChangeProductRead(BaseModel):
    product_id: int
    product_name: str
    store_branch_id: int
    branch_name: str
    changes_count: int
    current_price: Decimal
    last_updated: datetime


class PricingAnalyticsRead(BaseModel):
    granularity: str
    time_series: list[PriceTimeSeriesPointRead]
    increases_count: int
    decreases_count: int
    avg_change_percent: float | None
    median_change_percent: float | None
    top_products: list[TopPriceChangeProductRead]
    stale_prices_by_branch: list[BranchCountRead]


class AvailabilityByBranchRead(BaseModel):
    branch_id: int
    branch_name: str
    in_stock: int
    out_of_stock: int
    unknown: int


class AvailabilityAnalyticsRead(BaseModel):
    in_stock: int
    out_of_stock: int
    unknown: int
    by_branch: list[AvailabilityByBranchRead]
    active_listings_by_category: list[CategoryCountRead]


class LifecycleCountsRead(BaseModel):
    active: int
    scheduled: int
    expired: int
    cancelled: int


class PromotionsAnalyticsRead(BaseModel):
    counts: LifecycleCountsRead
    by_branch: list[BranchCountRead]
    by_type: list[TypeCountRead]
    products_currently_promoted: int


class CouponsAnalyticsRead(BaseModel):
    counts: LifecycleCountsRead
    by_type: list[TypeCountRead]
    by_branch: list[BranchCountRead]
    applies_to_all_branches_count: int


class ReportsAnalyticsRead(BaseModel):
    open_count: int
    in_review_count: int
    high_priority_open_count: int
    resolved_count: int
    dismissed_count: int
    resolved_previous_period_count: int | None
    by_type: list[TypeCountRead]
    by_branch: list[BranchCountRead]
    avg_resolution_hours: float | None


class ActivityEntryRead(BaseModel):
    type: str
    description: str
    occurred_at: datetime
    branch_id: int | None
    branch_name: str | None


class ActivityFeedRead(BaseModel):
    items: list[ActivityEntryRead]
