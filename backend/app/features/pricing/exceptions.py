from decimal import Decimal

from app.features.pricing.enums import Availability


class PriceVersionConflict(Exception):
    """Raised when the client's `version` doesn't match the row's current version."""

    def __init__(
        self,
        current_price: Decimal,
        current_version: int,
        current_availability: Availability | None = None,
    ) -> None:
        self.current_price = current_price
        self.current_version = current_version
        self.current_availability = current_availability
        super().__init__("Price was updated concurrently by someone else")


class StoreProductNotFound(Exception):
    pass
