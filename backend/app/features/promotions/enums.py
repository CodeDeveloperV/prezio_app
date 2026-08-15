import enum


class PromotionType(str, enum.Enum):
    PERCENTAGE_DISCOUNT = "percentage_discount"
    FIXED_DISCOUNT = "fixed_discount"
    SPECIAL_PRICE = "special_price"
    BUY_X_GET_Y = "buy_x_get_y"


class PromotionStatus(str, enum.Enum):
    """The only persisted lifecycle values. SCHEDULED/ACTIVE/EXPIRED are derived from
    PUBLISHED + start_at/end_at at read time (see `promotions.resolver.derive_display_status`)
    instead of being stored, so they can never drift out of sync with a promotion's dates."""

    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class PromotionDisplayStatus(str, enum.Enum):
    """The full conceptual lifecycle shown to the user; derived, never persisted."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
