import json
from datetime import datetime, timezone
from decimal import Decimal

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.websocket_manager import SHOPPING_LIST_UPDATES_CHANNEL_PREFIX, USER_INVITATIONS_CHANNEL_PREFIX
from app.features.notifications.enums import NotificationType
from app.features.notifications.service import NotificationService
from app.features.comparison.enums import ProductComparisonStatus
from app.features.pricing.enums import Availability, StoreProductStatus
from app.features.pricing.models import StoreProduct
from app.features.pricing.repository import StoreProductRepository
from app.features.stores.exceptions import StoreBranchNotFound
from app.features.stores.repository import StoreBranchRepository
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
from app.features.shopping_lists.schemas import (
    ShoppingListSummaryItem,
    ShoppingListSummaryPricingStatus,
    ShoppingListSummaryRead,
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
        store_branches: StoreBranchRepository,
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
        self.store_branches = store_branches

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

    async def set_active_branch(
        self, shopping_list_id: int, requesting_user_id: int, store_branch_id: int | None
    ) -> ShoppingList:
        """Sets (or, with None, clears) the branch this shopping session is currently happening
        at. Read once per check-off (see `update_item`) to snapshot where an item was actually
        bought -- changing it here never rewrites items already checked under a previous branch."""
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_edit_items(member, shopping_list):
            raise ShoppingListPermissionDenied("You cannot change the active branch of this list")

        if store_branch_id is not None:
            branch = await self.store_branches.get_by_id(store_branch_id)
            if branch is None:
                raise StoreBranchNotFound(store_branch_id)

        await self.lists.set_active_branch(shopping_list_id, store_branch_id)
        await self.db.commit()
        shopping_list.active_store_branch_id = store_branch_id
        return shopping_list

    # ---- items ----

    async def list_items(self, shopping_list_id: int, requesting_user_id: int) -> list[ShoppingListItem]:
        _, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_view(member):
            raise ShoppingListAccessDenied(shopping_list_id)
        return await self.items.list_by_shopping_list(shopping_list_id)

    async def get_summary(self, shopping_list_id: int, requesting_user_id: int) -> ShoppingListSummaryRead:
        """Builds the authoritative active-purchase read model without per-item queries."""
        shopping_list, member = await self._get_list_and_member(shopping_list_id, requesting_user_id)
        if not self.policy.can_view(member):
            raise ShoppingListAccessDenied(shopping_list_id)

        list_with_branch = await self.lists.get_with_active_branch(shopping_list_id)
        assert list_with_branch is not None
        shopping_list, branch, store = list_with_branch
        rows = await self.items.list_summary_rows(shopping_list_id, shopping_list.active_store_branch_id)

        items: list[ShoppingListSummaryItem] = []
        priced_subtotal = Decimal("0")
        unpriced_items_count = 0
        currency: str | None = None
        for item, product, brand, store_product in rows:
            pricing_status = self._summary_pricing_status(store_product)
            unit_price: Decimal | None = None
            subtotal: Decimal | None = None
            if pricing_status is ProductComparisonStatus.AVAILABLE:
                assert store_product is not None
                unit_price = Decimal(str(store_product.current_price))
                subtotal = unit_price * item.quantity
                priced_subtotal += subtotal
                currency = currency or store_product.currency
            else:
                unpriced_items_count += 1

            items.append(
                ShoppingListSummaryItem(
                    shopping_list_item_id=item.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    version=item.version,
                    name=product.canonical_name if product else "Producto desconocido",
                    brand=brand.name if brand else None,
                    presentation=product.presentation if product else None,
                    image_url=product.image_url if product else None,
                    store_product_id=store_product.id if store_product else None,
                    current_price=Decimal(str(store_product.current_price)) if store_product else None,
                    currency=store_product.currency if store_product else None,
                    availability=store_product.availability if store_product else None,
                    pricing_status=pricing_status,
                    unit_price=unit_price,
                    subtotal=subtotal,
                )
            )

        if not items or unpriced_items_count == 0:
            summary_status = ShoppingListSummaryPricingStatus.COMPLETE
        elif priced_subtotal > 0:
            summary_status = ShoppingListSummaryPricingStatus.PARTIAL
        else:
            summary_status = ShoppingListSummaryPricingStatus.UNAVAILABLE

        return ShoppingListSummaryRead(
            shopping_list_id=shopping_list.id,
            active_store_branch_id=shopping_list.active_store_branch_id,
            store_name=store.name if store else None,
            branch_name=branch.name if branch else None,
            distinct_products_count=len(items),
            total_units_count=sum(item.quantity for item in items),
            priced_subtotal=priced_subtotal if items and priced_subtotal > 0 else None,
            currency=currency,
            unpriced_items_count=unpriced_items_count,
            pricing_status=summary_status,
            items=items,
        )

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
        # purchase/order domain -- see backend/app/features/dashboard and
        # backend/app/features/analytics). Snapshot the list's currently-selected branch (if any)
        # and that branch's real listed price -- never a "cheapest across any store" guess, since
        # that isn't what the user actually paid. Both snapshots clear on uncheck.
        update_checked_snapshot = checked is not None and checked != existing.checked
        checked_at = None
        price_at_check = None
        store_branch_id = None
        if update_checked_snapshot and checked:
            checked_at = datetime.now(timezone.utc)
            store_branch_id = shopping_list.active_store_branch_id
            price_at_check = await self._price_at_branch(existing.product_id, store_branch_id)

        updated = await self.items.update_if_version_matches(
            item_id,
            expected_version,
            quantity=quantity,
            checked=checked,
            update_checked_snapshot=update_checked_snapshot,
            checked_at=checked_at,
            price_at_check=price_at_check,
            store_branch_id=store_branch_id,
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

    async def _price_at_branch(self, product_id: int, store_branch_id: int | None) -> Decimal | None:
        """The real price the user paid: whatever `product_id` is currently listed at in
        `store_branch_id`. Returns None (never a cheapest-across-any-store guess) when the list
        has no active branch selected, or when the selected branch doesn't list this product --
        an unpriced purchase is more honest than an invented one, and analytics reports it as
        such (see backend/app/features/analytics)."""
        if store_branch_id is None:
            return None
        store_product = await self.store_products.get_by_branch_and_product(store_branch_id, product_id)
        if store_product is None:
            return None
        return store_product.current_price

    @staticmethod
    def _summary_pricing_status(store_product: StoreProduct | None) -> ProductComparisonStatus:
        if store_product is None:
            return ProductComparisonStatus.MISSING_PRODUCT
        if store_product.current_price is None or store_product.current_price <= 0:
            return ProductComparisonStatus.PRICE_UNAVAILABLE
        if store_product.status is StoreProductStatus.INACTIVE or store_product.availability in {
            Availability.OUT_OF_STOCK,
            Availability.DISCONTINUED,
        }:
            return ProductComparisonStatus.UNAVAILABLE
        return ProductComparisonStatus.AVAILABLE

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
            "store_branch_id": item.store_branch_id,
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
