from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class PeriodMeta(BaseModel):
    """Data-quality metadata attached to every analytics metric. `coverage_percentage` is the
    share of checked items in the period that carry a valid `price_at_check` (never
    `StoreProduct.current_price` -- see PurchaseRecord). `unattributed_store_count` is the number
    of checked items in the period with no `store_branch_id` snapshot (pre-migration history, or
    checked while the list had no active branch selected)."""

    period_start: datetime
    period_end: datetime
    sample_size: int
    coverage_percentage: float
    missing_price_count: int
    unattributed_store_count: int


class TotalSpend(BaseModel):
    total_spent: Decimal
    meta: PeriodMeta


class StoreSpend(BaseModel):
    store_id: int
    store_name: str
    total_spent: Decimal
    session_count: int


class BranchSpend(BaseModel):
    store_branch_id: int
    store_id: int
    store_name: str
    branch_name: str
    total_spent: Decimal
    session_count: int


class SpendByStore(BaseModel):
    """Primary metric is chain-level (`by_chain`); `by_branch` is optional detail. Items with no
    `store_branch_id` contribute to `unattributed_spent` instead of being guessed into a chain."""

    by_chain: list[StoreSpend]
    by_branch: list[BranchSpend]
    unattributed_spent: Decimal
    unattributed_label: str = "Sin tienda registrada"
    meta: PeriodMeta


class MostUsedStore(BaseModel):
    """Defined by count of distinct purchase sessions (shopping_list_id + store + calendar day),
    not by item count -- see AnalyticsService._most_used_store."""

    store_id: int | None
    store_name: str | None
    session_count: int
    meta: PeriodMeta


class CategorySpend(BaseModel):
    category_id: int | None
    category_name: str
    total_spent: Decimal


class SpendByCategory(BaseModel):
    categories: list[CategorySpend]
    meta: PeriodMeta


class MonthlySpend(BaseModel):
    year: int
    month: int
    total_spent: Decimal
    is_partial: bool


class MonthlyEvolution(BaseModel):
    """Oldest first, current (possibly partial) month last."""

    months: list[MonthlySpend]
    meta: PeriodMeta


class FavoriteProduct(BaseModel):
    product_id: int
    product_name: str
    purchase_count: int
    total_quantity: int


class FavoriteProducts(BaseModel):
    products: list[FavoriteProduct]
    meta: PeriodMeta


class PersonalInflation(BaseModel):
    """A personal, estimated basket-inflation metric -- NOT an official/national CPI. See
    AnalyticsService._personal_inflation for the exact formula. `personal_inflation_percentage`
    is null whenever `has_sufficient_data` is false rather than forcing a misleading number."""

    personal_inflation_percentage: float | None
    has_sufficient_data: bool
    sample_size: int
    coverage_percentage: float
    window_months: int
    older_period_start: datetime
    older_period_end: datetime
    recent_period_start: datetime
    recent_period_end: datetime


class AnalyticsSummary(BaseModel):
    total_spend: TotalSpend
    spend_by_store: SpendByStore
    most_used_store: MostUsedStore
    spend_by_category: SpendByCategory
    monthly_evolution: MonthlyEvolution
    personal_inflation: PersonalInflation
    favorite_products: FavoriteProducts
