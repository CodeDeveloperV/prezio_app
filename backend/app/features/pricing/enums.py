import enum


class Availability(str, enum.Enum):
    IN_STOCK = "in_stock"
    OUT_OF_STOCK = "out_of_stock"
    UNKNOWN = "unknown"
    DISCONTINUED = "discontinued"


class StoreProductStatus(str, enum.Enum):
    """Whether a branch currently lists this product -- independent of `Availability`
    (which tracks stock-on-shelf for a listing that's still ACTIVE). Deactivating never
    deletes the row: PriceHistory/PriceConfirmation stay attached for traceability."""

    ACTIVE = "active"
    INACTIVE = "inactive"
