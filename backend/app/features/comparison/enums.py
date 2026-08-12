import enum


class ProductComparisonStatus(str, enum.Enum):
    """Why a shopping list line does or doesn't contribute a price at a given branch.

    Deliberately five distinct states instead of a single "not found" bucket: a missing
    catalog listing, an unusable price, a stale price, and an out-of-stock item all mean
    different things to the shopper and must not be conflated in the response counters.
    """

    AVAILABLE = "available"
    MISSING_PRODUCT = "missing_product"
    PRICE_UNAVAILABLE = "price_unavailable"
    STALE_PRICE = "stale_price"
    UNAVAILABLE = "unavailable"
