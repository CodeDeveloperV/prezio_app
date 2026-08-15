import enum


class CouponType(str, enum.Enum):
    PERCENTAGE_DISCOUNT = "percentage_discount"
    FIXED_AMOUNT = "fixed_amount"


class CouponStatus(str, enum.Enum):
    """The only persisted lifecycle values. SCHEDULED/ACTIVE/EXPIRED are derived from
    PUBLISHED + start_at/end_at at read time (see `coupons.resolver.derive_display_status`)
    instead of being stored, so they can never drift out of sync with a coupon's dates --
    same pattern as Promotion (EPIC 10 Fase 10.9)."""

    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class CouponDisplayStatus(str, enum.Enum):
    """The full conceptual lifecycle shown to the user; derived, never persisted."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
