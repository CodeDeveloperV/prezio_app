import json
from datetime import datetime, timezone
from decimal import Decimal

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.websocket_manager import SHOPPING_LIST_UPDATES_CHANNEL_PREFIX, USER_INVITATIONS_CHANNEL_PREFIX
from app.features.notifications.enums import NotificationType
from app.features.notifications.service import NotificationService
from app.features.pricing.repository import StoreProductRepository
from app.features.shopping_lists.enums import (
    ShoppingListInvitationStatus,
    ShoppingListMemberRole,
    ShoppingListStatus,
)
from app.features.shopping_lists.exceptions import (
    DuplicatePendingInvitation,
    InvitationNotPending,
    InvitedUserAlreadyMember,
    ShoppingListAccessDenied,
    ShoppingListInvitationAccessDenied,
    ShoppingListInvitationNotFound,
    ShoppingListItemNotFound,
    ShoppingListItemVersionConflict,
    ShoppingListMemberNotFound,
    ShoppingListNotFound,
    ShoppingListOwnerCannotBeRemoved,
    ShoppingListPermissionDenied,
)
from app.features.shopping_lists.models import (
    ShoppingList,
    ShoppingListInvitation,
    ShoppingListItem,
    ShoppingListMember,
)
from app.features.shopping_lists.policy import ShoppingListPermissionService
from app.features.shopping_lists.repository import (
    ShoppingListInvitationRepository,
    ShoppingListItemRepository,
    ShoppingListMemberRepository,
    ShoppingListRepository,
)
from app.features.users.repository import UserRepository


class ShoppingListService:
    def __init__(
        self,
        db: AsyncSession,
        lists: ShoppingListRepository,
        items: ShoppingListItemRepository,
        members: ShoppingListMemberRepository,
        invitations: ShoppingListInvitationRepository,
        users: UserRepository,
        redis: Redis,
        notifications: NotificationService,
        policy: ShoppingListPermissionService,
        store_products: StoreProductRepository,
    ) -> None:
        self.db = db
        self.lists = lists
        self.items = items
        self.members = members
        self.invitations = invitations
        self.users = users
        self.redis = redis
        self.notifications = notifications
        self.policy = policy
        self.store_products = store_products

    # ---- lists ----

    async def list_for_user(self, user_id: int) -> list[ShoppingList]:
        return await self.lists.list_for_member(user_id)

    async def get(self, shopping_list_id: int, requesting_user_id: int) -> ShoppingList:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_view(member):
            raise ShoppingListAccessDenied(shopping_list_id)
        return shopping_list

    async def create(
        self, owner_user_id: int, name: str, client_request_id: str | None = None
    ) -> ShoppingList:
        if client_request_id is not None:
            existing = await self.lists.get_by_client_request_id(owner_user_id, client_request_id)
            if existing is not None:
                return existing

        shopping_list = ShoppingList(owner_user_id=owner_user_id, name=name, client_request_id=client_request_id)
        await self.lists.add(shopping_list)
        await self.members.add(
            ShoppingListMember(
                shopping_list_id=shopping_list.id,
                user_id=owner_user_id,
                role=ShoppingListMemberRole.OWNER,
            )
        )
        await self.db.commit()
        return shopping_list

    async def archive(self, shopping_list_id: int, requesting_user_id: int) -> ShoppingList:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_archive(member):
            raise ShoppingListPermissionDenied("Only the list owner can archive it")

        shopping_list.status = ShoppingListStatus.ARCHIVED
        await self.db.flush()
        await self.db.commit()
        await self._publish_list_event(shopping_list.id, "list_archived", entity_id=shopping_list.id, payload={})
        return shopping_list

    async def delete(self, shopping_list_id: int, requesting_user_id: int) -> None:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_delete(member):
            raise ShoppingListPermissionDenied("Only the list owner can delete it")

        await self.items.delete_all_for_list(shopping_list_id)
        await self.members.delete_all_for_list(shopping_list_id)
        await self.invitations.delete_all_for_list(shopping_list_id)
        await self.lists.delete(shopping_list)
        await self.db.commit()

    # ---- members ----

    async def list_members(self, shopping_list_id: int, requesting_user_id: int) -> list[ShoppingListMember]:
        _, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_view(member):
            raise ShoppingListAccessDenied(shopping_list_id)
        return await self.members.list_by_shopping_list(shopping_list_id)

    async def remove_member(self, shopping_list_id: int, target_user_id: int, requesting_user_id: int) -> None:
        _, requesting_member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_remove_member(requesting_member):
            raise ShoppingListPermissionDenied("Only the list owner can remove members")

        target_member = await self.members.get_for_list_and_user(shopping_list_id, target_user_id)
        if target_member is None:
            raise ShoppingListMemberNotFound(target_user_id)
        if target_member.role == ShoppingListMemberRole.OWNER:
            raise ShoppingListOwnerCannotBeRemoved(shopping_list_id)

        await self.members.delete(target_member)
        await self.db.commit()
        await self._publish_list_event(
            shopping_list_id, "member_left", entity_id=target_user_id, payload={"user_id": target_user_id}
        )

    async def can_subscribe(self, shopping_list_id: int, user_id: int) -> bool:
        """Backs the WebSocket subscribe handshake: knowing `shopping_list_id` is never enough on
        its own -- the caller must currently be a member."""
        member = await self.members.get_for_list_and_user(shopping_list_id, user_id)
        return self.policy.can_view(member)

    # ---- items ----

    async def list_items(self, shopping_list_id: int, requesting_user_id: int) -> list[ShoppingListItem]:
        _, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_view(member):
            raise ShoppingListAccessDenied(shopping_list_id)
        return await self.items.list_by_shopping_list(shopping_list_id)

    async def add_item(
        self,
        shopping_list_id: int,
        product_id: int,
        quantity: int,
        added_by: int,
        client_request_id: str | None = None,
    ) -> ShoppingListItem:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, added_by)
        if not self.policy.can_edit_items(member, shopping_list):
            raise ShoppingListPermissionDenied("You cannot add items to this list")

        if client_request_id is not None:
            existing = await self.items.get_by_client_request_id(shopping_list_id, client_request_id)
            if existing is not None:
                return existing

        item = ShoppingListItem(
            shopping_list_id=shopping_list_id,
            product_id=product_id,
            quantity=quantity,
            added_by=added_by,
            client_request_id=client_request_id,
        )
        await self.items.add(item)
        await self.db.commit()
        await self._publish_list_event(
            shopping_list_id, "item_added", entity_id=item.id, version=item.version, payload=self._item_payload(item)
        )
        return item

    async def update_item(
        self,
        shopping_list_id: int,
        item_id: int,
        requesting_user_id: int,
        *,
        expected_version: int,
        quantity: int | None,
        checked: bool | None,
    ) -> ShoppingListItem:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_edit_items(member, shopping_list):
            raise ShoppingListPermissionDenied("You cannot edit items on this list")

        existing = await self.items.get_by_id(item_id)
        if existing is None or existing.shopping_list_id != shopping_list_id:
            raise ShoppingListItemNotFound(item_id)

        # A checked-state transition is this item's "purchase" signal (Prezio has no separate
        # purchase/order domain -- see backend/app/features/dashboard). Snapshot the cheapest
        # current price across stores at the moment of check; clear the snapshot on uncheck.
        update_checked_snapshot = checked is not None and checked != existing.checked
        checked_at = None
        price_at_check = None
        if update_checked_snapshot and checked:
            checked_at = datetime.now(timezone.utc)
            price_at_check = await self._cheapest_current_price(existing.product_id)

        updated = await self.items.update_if_version_matches(
            item_id,
            expected_version,
            quantity=quantity,
            checked=checked,
            update_checked_snapshot=update_checked_snapshot,
            checked_at=checked_at,
            price_at_check=price_at_check,
        )
        if updated is None:
            current = await self.items.get_by_id(item_id)
            assert current is not None
            raise ShoppingListItemVersionConflict(current)

        await self.db.commit()
        await self._publish_list_event(
            shopping_list_id,
            "item_updated",
            entity_id=updated.id,
            version=updated.version,
            payload=self._item_payload(updated),
        )
        return updated

    async def delete_item(self, shopping_list_id: int, item_id: int, requesting_user_id: int) -> None:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_edit_items(member, shopping_list):
            raise ShoppingListPermissionDenied("You cannot delete items on this list")

        existing = await self.items.get_by_id(item_id)
        if existing is None or existing.shopping_list_id != shopping_list_id:
            # Already gone: deleting is idempotent, so this is a no-op rather than a 404.
            return

        await self.items.delete(existing)
        await self.db.commit()
        await self._publish_list_event(shopping_list_id, "item_removed", entity_id=item_id, payload={"id": item_id})

    # ---- invitations ----

    async def create_invitation(
        self, shopping_list_id: int, invited_email: str, requesting_user_id: int
    ) -> ShoppingListInvitation:
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_invite(member, shopping_list):
            raise ShoppingListPermissionDenied("You cannot invite people to this list")

        invited_user = await self.users.get_by_email(invited_email)
        if invited_user is not None:
            existing_member = await self.members.get_for_list_and_user(shopping_list_id, invited_user.id)
            if existing_member is not None:
                raise InvitedUserAlreadyMember(invited_user.id)

        existing_invitation = await self.invitations.get_pending_for_list_and_email(shopping_list_id, invited_email)
        if existing_invitation is not None:
            raise DuplicatePendingInvitation(existing_invitation.id)

        invitation = ShoppingListInvitation(
            shopping_list_id=shopping_list_id,
            invited_email=invited_email,
            invited_user_id=invited_user.id if invited_user else None,
            invited_by_user_id=requesting_user_id,
        )
        await self.invitations.add(invitation)
        await self.db.commit()

        if invited_user is not None:
            await self.notifications.create(
                user_id=invited_user.id,
                type=NotificationType.COLLABORATIVE_LIST,
                title="Nueva invitación a una lista de compras",
                message=f"Te invitaron a colaborar en '{shopping_list.name}'",
                related_entity_type="shopping_list_invitation",
                related_entity_id=invitation.id,
            )
            await self.db.commit()
            await self._publish_invitation_created(invited_user.id, invitation, shopping_list.name)

        return invitation

    async def list_invitations_for_user(self, user_id: int) -> list[ShoppingListInvitation]:
        return await self.invitations.list_pending_for_user(user_id)

    async def accept_invitation(self, invitation_id: int, user_id: int) -> ShoppingListInvitation:
        invitation = await self._get_invitation_for_recipient(invitation_id, user_id)

        if invitation.status == ShoppingListInvitationStatus.ACCEPTED:
            return invitation  # idempotent: already accepted, membership already exists
        if invitation.status != ShoppingListInvitationStatus.PENDING:
            raise InvitationNotPending(invitation.status)

        existing_member = await self.members.get_for_list_and_user(invitation.shopping_list_id, user_id)
        if existing_member is None:
            await self.members.add(
                ShoppingListMember(
                    shopping_list_id=invitation.shopping_list_id,
                    user_id=user_id,
                    role=ShoppingListMemberRole.EDITOR,
                )
            )

        invitation.status = ShoppingListInvitationStatus.ACCEPTED
        invitation.responded_at = datetime.now(timezone.utc)
        await self.db.commit()

        await self._publish_list_event(
            invitation.shopping_list_id,
            "member_joined",
            entity_id=user_id,
            payload={"user_id": user_id, "role": ShoppingListMemberRole.EDITOR.value},
        )
        # invited_by_user_id is always an existing member of this list, so the list's own
        # channel already reaches them -- no separate personal-channel delivery needed here.
        await self._publish_list_event(
            invitation.shopping_list_id,
            "invitation_accepted",
            entity_id=invitation.id,
            payload={"invitation_id": invitation.id, "user_id": user_id},
        )
        return invitation

    async def decline_invitation(self, invitation_id: int, user_id: int) -> ShoppingListInvitation:
        invitation = await self._get_invitation_for_recipient(invitation_id, user_id)

        if invitation.status == ShoppingListInvitationStatus.DECLINED:
            return invitation  # idempotent
        if invitation.status != ShoppingListInvitationStatus.PENDING:
            raise InvitationNotPending(invitation.status)

        invitation.status = ShoppingListInvitationStatus.DECLINED
        invitation.responded_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self._publish_list_event(
            invitation.shopping_list_id,
            "invitation_declined",
            entity_id=invitation.id,
            payload={"invitation_id": invitation.id, "user_id": user_id},
        )
        return invitation

    async def revoke_invitation(self, invitation_id: int, requesting_user_id: int) -> ShoppingListInvitation:
        invitation = await self.invitations.get_by_id(invitation_id)
        if invitation is None:
            raise ShoppingListInvitationNotFound(invitation_id)

        member = await self.members.get_for_list_and_user(invitation.shopping_list_id, requesting_user_id)
        is_inviter = invitation.invited_by_user_id == requesting_user_id
        is_owner = member is not None and member.role == ShoppingListMemberRole.OWNER
        if not (is_inviter or is_owner):
            raise ShoppingListInvitationAccessDenied(invitation_id)

        if invitation.status == ShoppingListInvitationStatus.REVOKED:
            return invitation  # idempotent
        if invitation.status != ShoppingListInvitationStatus.PENDING:
            raise InvitationNotPending(invitation.status)

        invitation.status = ShoppingListInvitationStatus.REVOKED
        invitation.responded_at = datetime.now(timezone.utc)
        await self.db.commit()
        return invitation

    # ---- internal helpers ----

    async def _get_list_and_member(
        self, shopping_list_id: int, user_id: int
    ) -> tuple[ShoppingList, ShoppingListMember | None]:
        shopping_list = await self.lists.get_by_id(shopping_list_id)
        if shopping_list is None:
            raise ShoppingListNotFound(shopping_list_id)
        member = await self.members.get_for_list_and_user(shopping_list_id, user_id)
        return shopping_list, member

    async def _get_invitation_for_recipient(self, invitation_id: int, user_id: int) -> ShoppingListInvitation:
        invitation = await self.invitations.get_by_id(invitation_id)
        if invitation is None:
            raise ShoppingListInvitationNotFound(invitation_id)
        if invitation.invited_user_id != user_id:
            raise ShoppingListInvitationAccessDenied(invitation_id)
        return invitation

    async def _cheapest_current_price(self, product_id: int) -> Decimal | None:
        """Prezio's core value proposition is comparing prices across stores, and a shopping-list
        item has no store/branch of its own -- so the "purchase price" snapshotted on check is
        the cheapest currently-listed price for the product across all stores, not a specific
        store's price. None if no store currently lists this product."""
        store_products = await self.store_products.list_by_product(product_id)
        if not store_products:
            return None
        return min(sp.current_price for sp in store_products)

    @staticmethod
    def _item_payload(item: ShoppingListItem) -> dict:
        return {
            "id": item.id,
            "product_id": item.product_id,
            "quantity": item.quantity,
            "checked": item.checked,
            "added_by": item.added_by,
            "version": item.version,
            "checked_at": item.checked_at.isoformat() if item.checked_at else None,
            "price_at_check": str(item.price_at_check) if item.price_at_check is not None else None,
        }

    async def _publish_list_event(
        self,
        shopping_list_id: int,
        event_type: str,
        *,
        entity_id: int | None = None,
        version: int | None = None,
        payload: dict,
    ) -> None:
        """Every event carries event_type/shopping_list_id/entity_id/version/timestamp/payload.
        The backend is the source of truth -- this is purely a cache-invalidation signal, not a
        second copy of state, so the frontend should re-fetch on any doubt."""
        channel = f"{SHOPPING_LIST_UPDATES_CHANNEL_PREFIX}{shopping_list_id}"
        message = {
            "event_type": event_type,
            "shopping_list_id": shopping_list_id,
            "entity_id": entity_id,
            "version": version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        await self.redis.publish(channel, json.dumps(message))

    async def _publish_invitation_created(
        self, invited_user_id: int, invitation: ShoppingListInvitation, shopping_list_name: str
    ) -> None:
        channel = f"{USER_INVITATIONS_CHANNEL_PREFIX}{invited_user_id}"
        message = {
            "event_type": "invitation_created",
            "shopping_list_id": invitation.shopping_list_id,
            "entity_id": invitation.id,
            "version": None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "invitation_id": invitation.id,
                "shopping_list_id": invitation.shopping_list_id,
                "shopping_list_name": shopping_list_name,
                "invited_by_user_id": invitation.invited_by_user_id,
            },
        }
        await self.redis.publish(channel, json.dumps(message))
