class NotificationNotFound(Exception):
    pass


class NotificationAccessDenied(Exception):
    """Raised when a user who doesn't own a notification tries to act on it."""

    pass
