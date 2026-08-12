class ProductMergeNotFound(Exception):
    pass


class BarcodeNotFound(Exception):
    pass


class AliasNotFound(Exception):
    pass


class InvalidMergeRequest(Exception):
    """Raised when source_product_id == target_product_id, either product doesn't exist, or
    the source product has already been merged elsewhere."""

    pass


class AlreadyReviewed(Exception):
    """Raised when acting on an entity that is no longer PENDING -- a moderator already
    approved/rejected/merged it."""

    pass
