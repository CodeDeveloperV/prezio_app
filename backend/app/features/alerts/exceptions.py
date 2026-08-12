class PriceAlertNotFound(Exception):
    pass


class PriceAlertAccessDenied(Exception):
    """Raised when a user who doesn't own an alert tries to act on it."""

    pass


class InvalidPriceAlertScope(Exception):
    """Raised when an alert's scope is ambiguous, e.g. both store_id and store_branch_id set."""

    pass
