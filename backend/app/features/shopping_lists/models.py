from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.features.shopping_lists.enums import (
    ShoppingListInvitationStatus,
    ShoppingListMemberRole,
    ShoppingListStatus,
)
from app.shared.models_base import Base


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[ShoppingListStatus] = mapped_column(
        Enum(ShoppingListStatus, native_enum=False), default=ShoppingListStatus.ACTIVE
    )
    # Lets create-list be idempotent for offline clients replaying a queued creation after a
    # dropped connection -- same pattern as ShoppingListItem.client_request_id below.
    client_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # The branch this shopping session is currently happening at, set explicitly via
    # ShoppingListService.set_active_branch (see mobile's branch picker). Nullable -- most lists
    # never set one, e.g. collaborative planning lists with no single physical trip. Read at the
    # moment an item is checked to snapshot ShoppingListItem.store_branch_id/price_at_check; never
    # itself used as a historical record once that snapshot is taken.
    active_store_branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("store_branches.id"), nullable=True, index=True
    )

    items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="shopping_list")
    members: Mapped[list["ShoppingListMember"]] = relationship(back_populates="shopping_list")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(ForeignKey("shopping_lists.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(default=1)
    checked: Mapped[bool] = mapped_column(default=False, index=True)
    added_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # Optimistic concurrency, same pattern as StoreProduct.version (pricing): every mutating
    # update is an atomic `UPDATE ... WHERE id = ? AND version = ?`.
    version: Mapped[int] = mapped_column(default=1)
    # Lets add-item be idempotent: a client retrying a timed-out add (e.g. after a dropped
    # connection) sends the same client_request_id and gets back the original item instead of
    # creating a duplicate. Nullable/unindexed-unique on purpose -- most clients won't set it.
    client_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Snapshot taken the moment `checked` transitions False -> True; treated as this item's
    # "purchase" signal for dashboard/analytics (see backend/app/features/dashboard and
    # backend/app/features/analytics). Both are cleared back to null if the item is unchecked,
    # since there's no separate purchase record.
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    price_at_check: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Snapshot of the shopping list's `active_store_branch_id` at the exact moment this item was
    # checked (see ShoppingListService._cheapest_current_price's replacement, `_price_at_branch`).
    # Deliberately NOT a live FK to "wherever the list's branch is now" -- if the list's active
    # branch changes later this historical attribution must not move with it. Null for items
    # checked before this column existed, or checked while the list had no active branch selected;
    # analytics reports these as "unattributed" rather than guessing.
    store_branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("store_branches.id"), nullable=True, index=True
    )

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")


class ShoppingListMember(Base):
    """A user's membership in a shopping list. MVP roles are OWNER/EDITOR; VIEWER can be added
    later as a new enum member with no migration (see ShoppingListMemberRole)."""

    __tablename__ = "shopping_list_members"
    __table_args__ = (
        UniqueConstraint("shopping_list_id", "user_id", name="uq_shopping_list_members_list_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(ForeignKey("shopping_lists.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[ShoppingListMemberRole] = mapped_column(Enum(ShoppingListMemberRole, native_enum=False))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="members")


class ShoppingListInvitation(Base):
    """Email invite to an already-registered user. `invited_user_id` is populated eagerly at
    creation time when the email matches an existing account -- there are no anonymous invitees
    or invite links, so an invitation with no matching user simply can't be accepted yet."""

    __tablename__ = "shopping_list_invitations"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(ForeignKey("shopping_lists.id"), index=True)
    invited_email: Mapped[str] = mapped_column(String(255), index=True)
    invited_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    invited_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ShoppingListInvitationStatus] = mapped_column(
        Enum(ShoppingListInvitationStatus, native_enum=False),
        default=ShoppingListInvitationStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
