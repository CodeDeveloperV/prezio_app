import enum


class NotificationType(str, enum.Enum):
    """Kept generic on purpose -- Notification is not price-alert-specific, it's the single
    inbox for every kind of thing a user might need to be told about."""

    PRICE_ALERT = "price_alert"
    COLLABORATIVE_LIST = "collaborative_list"
    COUPON = "coupon"
    PROMOTION = "promotion"
    SYSTEM = "system"
