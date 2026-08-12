from decimal import Decimal


class PriceVersionConflict(Exception):
    """Raised when the client's `version` doesn't match the row's current version."""

    def __init__(self, current_price: Decimal, current_version: int) -> None:
        self.current_price = current_price
        self.current_version = current_version
        super().__init__("Price was updated concurrently by someone else")


class StoreProductNotFound(Exception):
    pass
