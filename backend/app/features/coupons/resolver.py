from datetime import datetime

from app.features.coupons.enums import CouponDisplayStatus, CouponStatus
from app.features.coupons.models import Coupon
from app.shared.time_utils import as_aware_utc


def normalize_code(code: str) -> str:
    """Uppercase+trim -- `PREZIO20`, `Prezio20`, and `prezio20` are the same code (EPIC 10
    Fase 10.10 spec). Uniqueness/lookup always compare this normalized form."""
    return code.strip().upper()


def derive_display_status(coupon: Coupon, *, now: datetime) -> CouponDisplayStatus:
    """SCHEDULED/ACTIVE/EXPIRED are never persisted -- always computed from `status` +
    `start_at`/`end_at` at read time so they can't drift out of sync with a coupon's dates.
    Same pattern as `promotions.resolver.derive_display_status`."""
    if coupon.status == CouponStatus.DRAFT:
        return CouponDisplayStatus.DRAFT
    if coupon.status == CouponStatus.CANCELLED:
        return CouponDisplayStatus.CANCELLED
    # SQLite (tests) drops tzinfo on round-trip even for tz-aware columns; Postgres does not.
    start_at = as_aware_utc(coupon.start_at)
    end_at = as_aware_utc(coupon.end_at)
    if now < start_at:
        return CouponDisplayStatus.SCHEDULED
    if now > end_at:
        return CouponDisplayStatus.EXPIRED
    return CouponDisplayStatus.ACTIVE


def is_currently_active(coupon: Coupon, *, now: datetime) -> bool:
    return derive_display_status(coupon, now=now) == CouponDisplayStatus.ACTIVE
