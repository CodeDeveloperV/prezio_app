class ProductNotFound(Exception):
    pass


class DuplicateBarcodeError(Exception):
    """Raised when a barcode is already registered for a different product at the same store."""

    pass


class BarcodeNotFound(Exception):
    pass
