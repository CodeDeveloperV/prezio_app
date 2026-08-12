class ShoppingListNotFound(Exception):
    pass


class ShoppingListAccessDenied(Exception):
    """Raised when a user who isn't the list's owner tries to act on it."""

    pass
