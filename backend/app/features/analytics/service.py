from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.engine import Row

from app.features.analytics.enums import AnalyticsPeriod
from app.features.analytics.repository import AnalyticsRepository
from app.features.analytics.schemas import (
    AnalyticsSummary,
    BranchSpend,
    CategorySpend,
    FavoriteProduct,
    FavoriteProducts,
    MonthlyEvolution,
    MonthlySpend,
    MostUsedStore,
    PeriodMeta,
    PersonalInflation,
    SpendByCategory,
    SpendByStore,
    StoreSpend,
    TotalSpend,
)
from app.shared.time_utils import as_aware_utc, month_start

# `AnalyticsPeriod.ALL` aside, every other period is a rolling window measured in days (not
# calendar months) -- simplest, and consistent with "avoid SQL date-trunc"; only monthly
# evolution (a distinct, calendar-month-bucketed metric, per spec) needs true calendar months.
_PERIOD_DAYS: dict[AnalyticsPeriod, int] = {
    AnalyticsPeriod.LAST_30_DAYS: 30,
    AnalyticsPeriod.LAST_3_MONTHS: 90,
    AnalyticsPeriod.LAST_6_MONTHS: 182,
    AnalyticsPeriod.LAST_12_MONTHS: 365,
}

FAVORITE_PRODUCTS_LIMIT = 10
UNATTRIBUTED_CATEGORY_LABEL = "Sin categoría"

# A product only counts toward personal_inflation if it was bought in both halves of the
# inflation window AND the basket has at least this many such qualifying products -- below this,
# the result is too noise-prone to call a percentage, so has_sufficient_data is False and
# personal_inflation_percentage is null instead of a misleading number.
MIN_INFLATION_SAMPLE_PRODUCTS = 3


@dataclass
class PurchaseRecord:
    """One checked ShoppingListItem, flattened with the joined product/category/store fields
    AnalyticsRepository fetches. `price_at_check` and `store_branch_id`/`store_id` are exactly
    what was snapshotted at check time -- never re-derived from current prices or the list's
    current active branch (see ShoppingListService.update_item)."""

    shopping_list_id: int
    product_id: int
    product_name: str
    category_id: int | None
    category_name: str | None
    quantity: int
    price_at_check: Decimal | None
    checked_at: datetime
    store_branch_id: int | None
    store_id: int | None
    store_name: str | None
    branch_name: str | None


def _to_record(row: Row) -> PurchaseRecord:
    item = row.ShoppingListItem
    assert item.checked_at is not None
    return PurchaseRecord(
        shopping_list_id=item.shopping_list_id,
        product_id=item.product_id,
        product_name=row.product_name,
        category_id=row.category_id,
        category_name=row.category_name,
        quantity=item.quantity,
        price_at_check=item.price_at_check,
        checked_at=as_aware_utc(item.checked_at),
        store_branch_id=row.store_branch_id,
        store_id=row.store_id,
        store_name=row.store_name,
        branch_name=row.branch_name,
    )


class AnalyticsService:
    def __init__(self, repository: AnalyticsRepository) -> None:
        self.repository = repository

    async def get_summary(
        self,
        user_id: int,
        *,
        period: AnalyticsPeriod = AnalyticsPeriod.LAST_3_MONTHS,
        inflation_window_months: int = 12,
        now: datetime | None = None,
    ) -> AnalyticsSummary:
        now = now or datetime.now(timezone.utc)
        rows = await self.repository.list_checked_items_for_user(user_id)
        all_records = [_to_record(row) for row in rows]

        period_start, period_end = self._resolve_period(period, now, all_records)
        records = [r for r in all_records if period_start <= r.checked_at <= period_end]
        priced = [r for r in records if r.price_at_check is not None]

        meta = PeriodMeta(
            period_start=period_start,
            period_end=period_end,
            sample_size=len(records),
            coverage_percentage=self._percentage(len(priced), len(records)),
            missing_price_count=len(records) - len(priced),
            unattributed_store_count=sum(1 for r in records if r.store_branch_id is None),
        )

        total_spend = TotalSpend(total_spent=self._sum_spend(priced), meta=meta)

        return AnalyticsSummary(
            total_spend=total_spend,
            spend_by_store=self._spend_by_store(priced, meta),
            most_used_store=self._most_used_store(records, meta),
            spend_by_category=self._spend_by_category(priced, meta),
            monthly_evolution=self._monthly_evolution(priced, period_start, now, meta),
            personal_inflation=self._personal_inflation(all_records, now, inflation_window_months),
            favorite_products=self._favorite_products(records, meta),
        )

    def _resolve_period(
        self, period: AnalyticsPeriod, now: datetime, records: list[PurchaseRecord]
    ) -> tuple[datetime, datetime]:
        if period == AnalyticsPeriod.ALL:
            start = min((r.checked_at for r in records), default=now)
            return start, now
        return now - timedelta(days=_PERIOD_DAYS[period]), now

    @staticmethod
    def _percentage(part: int, whole: int) -> float:
        return float(part) / whole * 100 if whole else 0.0

    @staticmethod
    def _sum_spend(records: list[PurchaseRecord]) -> Decimal:
        total = Decimal("0")
        for r in records:
            assert r.price_at_check is not None
            total += r.price_at_check * r.quantity
        return total

    def _spend_by_store(self, priced: list[PurchaseRecord], meta: PeriodMeta) -> SpendByStore:
        """Chain is the primary aggregation (StoreBranch -> Store); branch is optional detail.
        Records with no store_branch_id are unattributed (pre-migration history, or checked with
        no active branch selected) and are never guessed into a chain."""
        chain_totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
        chain_names: dict[int, str] = {}
        chain_sessions: dict[int, set[tuple[int, object]]] = defaultdict(set)
        branch_totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
        branch_info: dict[int, tuple[int, str, str]] = {}
        branch_sessions: dict[int, set[tuple[int, object]]] = defaultdict(set)
        unattributed_spent = Decimal("0")

        for r in priced:
            spend = r.price_at_check * r.quantity  # type: ignore[operator]
            if r.store_id is None or r.store_branch_id is None:
                unattributed_spent += spend
                continue
            chain_totals[r.store_id] += spend
            chain_names[r.store_id] = r.store_name or ""
            chain_sessions[r.store_id].add((r.shopping_list_id, r.checked_at.date()))

            branch_totals[r.store_branch_id] += spend
            branch_info[r.store_branch_id] = (r.store_id, r.store_name or "", r.branch_name or "")
            branch_sessions[r.store_branch_id].add((r.shopping_list_id, r.checked_at.date()))

        by_chain = sorted(
            (
                StoreSpend(
                    store_id=store_id,
                    store_name=chain_names[store_id],
                    total_spent=total,
                    session_count=len(chain_sessions[store_id]),
                )
                for store_id, total in chain_totals.items()
            ),
            key=lambda s: s.total_spent,
            reverse=True,
        )
        by_branch = sorted(
            (
                BranchSpend(
                    store_branch_id=branch_id,
                    store_id=branch_info[branch_id][0],
                    store_name=branch_info[branch_id][1],
                    branch_name=branch_info[branch_id][2],
                    total_spent=total,
                    session_count=len(branch_sessions[branch_id]),
                )
                for branch_id, total in branch_totals.items()
            ),
            key=lambda s: s.total_spent,
            reverse=True,
        )
        return SpendByStore(
            by_chain=list(by_chain),
            by_branch=list(by_branch),
            unattributed_spent=unattributed_spent,
            meta=meta,
        )

    def _most_used_store(self, records: list[PurchaseRecord], meta: PeriodMeta) -> MostUsedStore:
        """"Most used" is defined by purchase-session frequency, not item count. Prezio has no
        explicit "completed purchase" state, so a session is approximated as the set of distinct
        (shopping_list_id, calendar day) combinations attributed to a given store -- i.e. items
        checked at the same store, in the same list, on the same day count as one visit rather
        than N independent visits. Documented judgment call (Epic 13 spec item 4)."""
        sessions: dict[int, set[tuple[int, object]]] = defaultdict(set)
        names: dict[int, str] = {}
        for r in records:
            if r.store_id is None:
                continue
            sessions[r.store_id].add((r.shopping_list_id, r.checked_at.date()))
            names[r.store_id] = r.store_name or ""

        if not sessions:
            return MostUsedStore(store_id=None, store_name=None, session_count=0, meta=meta)

        store_id = max(sessions, key=lambda sid: len(sessions[sid]))
        return MostUsedStore(
            store_id=store_id, store_name=names[store_id], session_count=len(sessions[store_id]), meta=meta
        )

    def _spend_by_category(self, priced: list[PurchaseRecord], meta: PeriodMeta) -> SpendByCategory:
        totals: dict[int | None, Decimal] = defaultdict(lambda: Decimal("0"))
        names: dict[int | None, str] = {}
        for r in priced:
            key = r.category_id
            totals[key] += r.price_at_check * r.quantity  # type: ignore[operator]
            names[key] = r.category_name or UNATTRIBUTED_CATEGORY_LABEL

        categories = sorted(
            (
                CategorySpend(category_id=key, category_name=names[key], total_spent=total)
                for key, total in totals.items()
            ),
            key=lambda c: c.total_spent,
            reverse=True,
        )
        return SpendByCategory(categories=list(categories), meta=meta)

    def _monthly_evolution(
        self, priced: list[PurchaseRecord], period_start: datetime, now: datetime, meta: PeriodMeta
    ) -> MonthlyEvolution:
        """Calendar-month buckets (not the rolling `period`), per spec item 6 -- avoids comparing
        a partial current month against a complete prior one without saying so (`is_partial`)."""
        cursor = month_start(period_start)
        end = month_start(now)
        months: list[tuple[int, int]] = []
        while cursor <= end:
            months.append((cursor.year, cursor.month))
            cursor = month_start(cursor, offset=1)

        totals = {ym: Decimal("0") for ym in months}
        for r in priced:
            ym = (r.checked_at.year, r.checked_at.month)
            if ym in totals:
                totals[ym] += r.price_at_check * r.quantity  # type: ignore[operator]

        current_ym = (now.year, now.month)
        result = [
            MonthlySpend(year=year, month=month, total_spent=totals[(year, month)], is_partial=(year, month) == current_ym)
            for year, month in months
        ]
        return MonthlyEvolution(months=result, meta=meta)

    def _favorite_products(self, records: list[PurchaseRecord], meta: PeriodMeta) -> FavoriteProducts:
        """Ranked by purchase frequency (count of checked occurrences), total quantity as
        tiebreaker -- per spec item 8, independent of price data availability."""
        counts: dict[int, int] = defaultdict(int)
        quantities: dict[int, int] = defaultdict(int)
        names: dict[int, str] = {}
        for r in records:
            counts[r.product_id] += 1
            quantities[r.product_id] += r.quantity
            names[r.product_id] = r.product_name

        products = sorted(
            (
                FavoriteProduct(
                    product_id=pid,
                    product_name=names[pid],
                    purchase_count=counts[pid],
                    total_quantity=quantities[pid],
                )
                for pid in counts
            ),
            key=lambda p: (p.purchase_count, p.total_quantity),
            reverse=True,
        )[:FAVORITE_PRODUCTS_LIMIT]
        return FavoriteProducts(products=list(products), meta=meta)

    def _personal_inflation(
        self, all_records: list[PurchaseRecord], now: datetime, window_months: int
    ) -> PersonalInflation:
        """Personal basket inflation, explicitly NOT the official/national CPI.

        Formula: the trailing `window_months` (approximated as `window_months * 30` rolling days,
        deliberately not calendar months -- unlike monthly_evolution, this window only needs to
        split cleanly in half) is split into two equal-length, comparable halves: an "older" half
        and a "recent" half. A product qualifies only if it has at least one priced purchase in
        BOTH halves. For each qualifying product p:

            avg_price_old(p) = sum(price_at_check * qty in older half) / sum(qty in older half)
            avg_price_new(p) = sum(price_at_check * qty in recent half) / sum(qty in recent half)
            change(p)        = (avg_price_new(p) - avg_price_old(p)) / avg_price_old(p)
            weight(p)         = total spend on p across both halves

        personal_inflation_percentage = 100 * sum(weight(p) * change(p)) / sum(weight(p))
        coverage_percentage = 100 * sum(weight(p) for qualifying p) / total spend across the
        whole window (all priced records, qualifying or not).

        Products lacking history in one of the two halves are excluded entirely (never
        interpolated). If fewer than MIN_INFLATION_SAMPLE_PRODUCTS qualify, or their combined
        weight is zero, has_sufficient_data is False and personal_inflation_percentage is null
        rather than forcing a number from too little evidence."""
        window_days = window_months * 30
        window_start = now - timedelta(days=window_days)
        midpoint = now - timedelta(days=window_days // 2)

        older_qty: dict[int, int] = defaultdict(int)
        older_spend: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
        recent_qty: dict[int, int] = defaultdict(int)
        recent_spend: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
        total_window_spend = Decimal("0")

        for r in all_records:
            if r.price_at_check is None or r.checked_at < window_start or r.checked_at > now:
                continue
            spend = r.price_at_check * r.quantity
            total_window_spend += spend
            if r.checked_at < midpoint:
                older_qty[r.product_id] += r.quantity
                older_spend[r.product_id] += spend
            else:
                recent_qty[r.product_id] += r.quantity
                recent_spend[r.product_id] += spend

        qualifying = [pid for pid in older_qty if pid in recent_qty]

        weighted_change = Decimal("0")
        weight_sum = Decimal("0")
        for pid in qualifying:
            avg_old = older_spend[pid] / older_qty[pid]
            avg_new = recent_spend[pid] / recent_qty[pid]
            if avg_old == 0:
                continue
            change = (avg_new - avg_old) / avg_old
            weight = older_spend[pid] + recent_spend[pid]
            weighted_change += change * weight
            weight_sum += weight

        sample_size = len(qualifying)
        has_sufficient_data = sample_size >= MIN_INFLATION_SAMPLE_PRODUCTS and weight_sum > 0
        personal_inflation_percentage = (
            float(weighted_change / weight_sum * 100) if has_sufficient_data else None
        )
        coverage_percentage = (
            float(weight_sum / total_window_spend * 100) if total_window_spend > 0 else 0.0
        )

        return PersonalInflation(
            personal_inflation_percentage=personal_inflation_percentage,
            has_sufficient_data=has_sufficient_data,
            sample_size=sample_size,
            coverage_percentage=coverage_percentage,
            window_months=window_months,
            older_period_start=window_start,
            older_period_end=midpoint,
            recent_period_start=midpoint,
            recent_period_end=now,
        )
