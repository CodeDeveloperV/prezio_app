from app.features.shopping_lists.models import ShoppingListItem


class ShoppingListNotFound(Exception):
    pass


class ShoppingListAccessDenied(Exception):
    """Raised when a user who isn't a member of the list tries to view it."""

    pass


class ShoppingListPermissionDenied(Exception):
    """Raised when a member's role doesn't allow the requested action (e.g. an EDITOR trying to
    archive the list or remove a member)."""

    pass


class ShoppingListArchived(Exception):
    """Raised when a mutation is attempted against an ARCHIVED (read-only) list."""

    pass


class ShoppingListItemNotFound(Exception):
    pass


class ShoppingListItemVersionConflict(Exception):
    """Raised when the client's `version` doesn't match the item's current version."""

    def __init__(self, current_item: ShoppingListItem) -> None:
        self.current_item = current_item
        super().__init__("Item was updated concurrently by someone else")


class ShoppingListMemberNotFound(Exception):
    pass


class ShoppingListOwnerCannotBeRemoved(Exception):
    pass


class ShoppingListInvitationNotFound(Exception):
    pass


class ShoppingListInvitationAccessDenied(Exception):
    """Raised when a user tries to accept/decline/revoke an invitation that isn't theirs to act on."""

    pass


class DuplicatePendingInvitation(Exception):
    pass


class InvitedUserAlreadyMember(Exception):
    pass


class InvitationNotPending(Exception):
    """Raised when accept/decline/revoke targets an invitation in a terminal state that doesn't
    match the requested transition (e.g. accepting an already-declined invitation). Re-applying
    the *same* terminal transition (accept-an-accepted, decline-a-declined, revoke-a-revoked) is
    handled as an idempotent no-op by the service instead of raising this."""

    pass
