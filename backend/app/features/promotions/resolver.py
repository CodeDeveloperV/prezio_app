from datetime import datetime
from decimal import Decimal

from app.features.promotions.enums import PromotionDisplayStatus, PromotionStatus, PromotionType
from app.features.promotions.models import Promotion
from app.shared.time_utils import as_aware_utc

# Deterministic default ordering when two promotions share the same explicit `priority`:
# SPECIAL_PRICE > PERCENTAGE_DISCOUNT > FIXED_DISCOUNT > BUY_X_GET_Y (lower value wins). This
# is also the default `priority` assigned to a new promotion so overlap resolution is never
# accidentally DB-order-dependent.
_DEFAULT_TYPE_ORDER = {
    PromotionType.SPECIAL_PRICE: 0,
    PromotionType.PERCENTAGE_DISCOUNT: 1,
    PromotionType.FIXED_DISCOUNT: 2,
    PromotionType.BUY_X_GET_Y: 3,
}


def default_priority_for_type(promotion_type: PromotionType) -> int:
    return _DEFAULT_TYPE_ORDER[promotion_type]


def derive_display_status(promotion: Promotion, *, now: datetime) -> PromotionDisplayStatus:
    """SCHEDULED/ACTIVE/EXPIRED are never persisted -- always computed from `status` +
    `start_at`/`end_at` at read time so they can't drift out of sync with a promotion's dates."""
    if promotion.status == PromotionStatus.DRAFT:
        return PromotionDisplayStatus.DRAFT
    if promotion.status == PromotionStatus.CANCELLED:
        return PromotionDisplayStatus.CANCELLED
    # SQLite (tests) drops tzinfo on round-trip even for tz-aware columns; Postgres does not.
    start_at = as_aware_utc(promotion.start_at)
    end_at = as_aware_utc(promotion.end_at)
    if now < start_at:
        return PromotionDisplayStatus.SCHEDULED
    if now > end_at:
        return PromotionDisplayStatus.EXPIRED
    return PromotionDisplayStatus.ACTIVE


def is_currently_active(promotion: Promotion, *, now: datetime) -> bool:
    return derive_display_status(promotion, now=now) == PromotionDisplayStatus.ACTIVE


def select_effective_promotion(candidates: list[Promotion], *, now: datetime) -> Promotion | None:
    """Overlap is allowed but never auto-stacks: exactly one promotion applies to a given
    product/branch at a time. Deterministic choice by `priority` (lower wins), then by `id`
    (older wins) as a final tie-break that never depends on DB row order."""
    active = [p for p in candidates if is_currently_active(p, now=now)]
    if not active:
        return None
    return min(active, key=lambda p: (p.priority, p.id))


def compute_effective_price(promotion: Promotion, base_price: Decimal) -> Decimal:
    """Per-type Decimal formula for the discounted unit price; never returns a negative price.

    BUY_X_GET_Y has no single discounted unit price -- it's a quantity benefit, not a price
    change (see the promotion's `buy_quantity`/`pay_quantity` instead of calling this for it).
    """
    if promotion.type == PromotionType.PERCENTAGE_DISCOUNT:
        assert promotion.percentage_value is not None
        factor = (Decimal("100") - promotion.percentage_value) / Decimal("100")
        return max(base_price * factor, Decimal("0"))
    if promotion.type == PromotionType.FIXED_DISCOUNT:
        assert promotion.fixed_discount_value is not None
        return max(base_price - promotion.fixed_discount_value, Decimal("0"))
    if promotion.type == PromotionType.SPECIAL_PRICE:
        assert promotion.special_price is not None
        return max(promotion.special_price, Decimal("0"))
    raise ValueError(f"{promotion.type} has no single effective unit price")
