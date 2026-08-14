from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.features.dashboard.repository import DashboardRepository
from app.features.dashboard.schemas import DashboardSummary, LastPurchase, MonthlySummary, MostPurchasedProduct
from app.features.shopping_lists.models import ShoppingListItem
from app.features.users.repository import UserProfileRepository
from app.shared.time_utils import as_aware_utc as _as_aware_utc
from app.shared.time_utils import month_start as _month_start

# How far back a checked item's "would-have-paid" reference price is allowed to come from, used
# to compute "ahorro mensual". A judgment call (see README "Dashboard inteligente"): Prezio has
# no separate "list price" concept, so savings are approximated against the highest price
# recorded for the product across all stores in this trailing window.
REFERENCE_PRICE_WINDOW_DAYS = 90
MOST_PURCHASED_LIMIT = 5
HISTORY_MONTHS = 6


class DashboardService:
    def __init__(self, repository: DashboardRepository, profiles: UserProfileRepository) -> None:
        self.repository = repository
        self.profiles = profiles

    async def get_summary(self, user_id: int, *, now: datetime | None = None) -> DashboardSummary:
        now = now or datetime.now(timezone.utc)
        month_starts = [_month_start(now, offset=-(HISTORY_MONTHS - 1 - i)) for i in range(HISTORY_MONTHS)]

        items = await self.repository.list_checked_items_for_user(user_id)
        reference_prices = await self._build_reference_price_index(
            {item.product_id for item in items}
        )

        monthly_history = [
            self._summarize_month(items, year=start.year, month=start.month, reference_prices=reference_prices)
            for start in month_starts
        ]
        current_month = monthly_history[-1]
        previous_month = monthly_history[-2]

        most_purchased_rows = await self.repository.most_purchased_products(user_id, limit=MOST_PURCHASED_LIMIT)
        most_purchased_products = [
            MostPurchasedProduct(product_id=product_id, product_name=product_name, total_quantity=total_quantity)
            for product_id, product_name, total_quantity in most_purchased_rows
        ]

        last_purchase_row = await self.repository.last_purchase(user_id)
        last_purchase = None
        if last_purchase_row is not None:
            item, product_name = last_purchase_row
            assert item.checked_at is not None and item.price_at_check is not None
            last_purchase = LastPurchase(
                item_id=item.id,
                product_id=item.product_id,
                product_name=product_name,
                quantity=item.quantity,
                price_at_check=item.price_at_check,
                checked_at=item.checked_at,
            )

        profile = await self.profiles.get_by_user_id(user_id)
        monthly_budget = profile.monthly_budget if profile is not None else None
        remaining_budget = (
            monthly_budget - current_month.total_spent if monthly_budget is not None else None
        )

        return DashboardSummary(
            current_month=current_month,
            previous_month=previous_month,
            monthly_history=monthly_history,
            most_purchased_products=most_purchased_products,
            last_purchase=last_purchase,
            monthly_budget=monthly_budget,
            remaining_budget=remaining_budget,
        )

    async def _build_reference_price_index(self, product_ids: set[int]) -> dict[int, list[tuple[datetime, Decimal]]]:
        rows = await self.repository.price_history_for_products(list(product_ids))
        index: dict[int, list[tuple[datetime, Decimal]]] = defaultdict(list)
        for product_id, updated_at, new_price in rows:
            index[product_id].append((_as_aware_utc(updated_at), new_price))
        return index

    def _reference_price(
        self,
        product_id: int,
        as_of: datetime,
        reference_prices: dict[int, list[tuple[datetime, Decimal]]],
    ) -> Decimal | None:
        history = reference_prices.get(product_id)
        if not history:
            return None
        window_start = as_of - timedelta(days=REFERENCE_PRICE_WINDOW_DAYS)
        candidates = [price for updated_at, price in history if window_start <= updated_at <= as_of]
        return max(candidates) if candidates else None

    def _summarize_month(
        self,
        items: list[ShoppingListItem],
        *,
        year: int,
        month: int,
        reference_prices: dict[int, list[tuple[datetime, Decimal]]],
    ) -> MonthlySummary:
        total_spent = Decimal("0")
        total_savings = Decimal("0")
        for item in items:
            assert item.checked_at is not None
            checked_at = _as_aware_utc(item.checked_at)
            if checked_at.year != year or checked_at.month != month:
                continue
            if item.price_at_check is None:
                continue
            total_spent += item.price_at_check * item.quantity
            reference = self._reference_price(item.product_id, checked_at, reference_prices)
            if reference is not None:
                total_savings += max(reference - item.price_at_check, Decimal("0")) * item.quantity
        return MonthlySummary(year=year, month=month, total_spent=total_spent, total_savings=total_savings)
