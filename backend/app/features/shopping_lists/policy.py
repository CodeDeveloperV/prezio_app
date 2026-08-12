from app.features.shopping_lists.enums import ShoppingListMemberRole, ShoppingListStatus
from app.features.shopping_lists.models import ShoppingList, ShoppingListMember


class ShoppingListPermissionService:
    """Centralizes every shopping-list authorization decision so REST endpoints and the
    WebSocket subscription handshake enforce exactly the same rules -- no `if user.role == ...`
    scattered across routers/services.

    Every check takes the caller's membership row (or None, if they aren't a member) plus the
    list itself where the list's status matters. Stateless and pure, so it's cheap to call once
    per request/subscription attempt.
    """

    def can_view(self, member: ShoppingListMember | None) -> bool:
        return member is not None

    def can_edit_items(self, member: ShoppingListMember | None, shopping_list: ShoppingList) -> bool:
        if member is None or shopping_list.status != ShoppingListStatus.ACTIVE:
            return False
        return member.role in (ShoppingListMemberRole.OWNER, ShoppingListMemberRole.EDITOR)

    def can_invite(self, member: ShoppingListMember | None, shopping_list: ShoppingList) -> bool:
        if member is None or shopping_list.status != ShoppingListStatus.ACTIVE:
            return False
        return member.role in (ShoppingListMemberRole.OWNER, ShoppingListMemberRole.EDITOR)

    def can_remove_member(self, member: ShoppingListMember | None) -> bool:
        return member is not None and member.role == ShoppingListMemberRole.OWNER

    def can_archive(self, member: ShoppingListMember | None) -> bool:
        return member is not None and member.role == ShoppingListMemberRole.OWNER

    def can_delete(self, member: ShoppingListMember | None) -> bool:
        return member is not None and member.role == ShoppingListMemberRole.OWNER
