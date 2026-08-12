import enum


class ShoppingListStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class ShoppingListMemberRole(str, enum.Enum):
    """VIEWER is intentionally not modeled yet -- stored as plain VARCHAR (native_enum=False on
    the column), so adding it later is a pure application-level change, no migration needed."""

    OWNER = "owner"
    EDITOR = "editor"


class ShoppingListInvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    REVOKED = "revoked"
