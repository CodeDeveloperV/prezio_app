import { Q } from '@nozbe/watermelondb';

import { database } from '../../../../shared/services/db/database';
import {
  deletePendingActionsForEntity,
  enqueuePendingAction,
  findUnsyncedCreateAction,
  findUnsyncedQuantityAction,
} from '../../../../shared/services/db/pendingActionQueue';

import type ShoppingList from '../../../../shared/services/db/models/ShoppingList';
import type ShoppingListItem from '../../../../shared/services/db/models/ShoppingListItem';

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');

/**
 * Optimistic local writes for every offline-allowed shopping-list mutation (see Epic 14 design:
 * invites, roles, catalog/price edits stay online-only and are NOT exposed here). Each function
 * writes the local record and enqueues its PendingAction in the same `database.write()` so the
 * two can never drift apart -- the SyncEngine is the only thing that later touches the queue.
 */

export async function createShoppingListOffline(name: string): Promise<ShoppingList> {
  return database.write(async () => {
    const list = await shoppingLists().create((l) => {
      l.serverId = null;
      l.name = name;
      l.ownerUserId = null;
      l.synced = false;
    });

    await enqueuePendingAction({
      actionType: 'CREATE_LIST',
      entityType: 'shopping_list',
      entityLocalId: list.id,
      shoppingListLocalId: list.id,
      payload: { name },
    });

    return list;
  });
}

export async function addShoppingListItemOffline(params: {
  shoppingListLocalId: string;
  productId: string;
  productName: string;
  quantity: number;
}): Promise<ShoppingListItem> {
  return database.write(async () => {
    const item = await shoppingListItems().create((i) => {
      i.serverId = null;
      i.shoppingListId = params.shoppingListLocalId;
      i.productId = params.productId;
      i.productName = params.productName;
      i.quantity = params.quantity;
      i.checked = false;
      i.addedBy = null;
      i.version = 1;
      i.synced = false;
    });

    await enqueuePendingAction({
      actionType: 'CREATE_ITEM',
      entityType: 'shopping_list_item',
      entityLocalId: item.id,
      shoppingListLocalId: params.shoppingListLocalId,
      payload: {
        productId: params.productId,
        productName: params.productName,
        quantity: params.quantity,
      },
    });

    return item;
  });
}

export async function setItemCheckedOffline(item: ShoppingListItem, checked: boolean): Promise<void> {
  await database.write(async () => {
    await item.update((i) => {
      i.checked = checked;
      i.synced = false;
    });

    await enqueuePendingAction({
      actionType: 'ITEM_CHECKED_SET',
      entityType: 'shopping_list_item',
      entityLocalId: item.id,
      shoppingListLocalId: item.shoppingListId,
      payload: { checked },
      baseVersion: item.version,
    });
  });
}

/** `delta` is +1/-1 (or any signed step) applied to the item's current local quantity. Merges
 * into an already-queued, not-yet-synced quantity action for the same item instead of piling one
 * PendingAction per tap -- see ItemQuantityDeltaPayload for why `baseQuantity` is fixed at the
 * first tap and not updated on every merge. */
export async function changeItemQuantityOffline(item: ShoppingListItem, delta: number): Promise<void> {
  await database.write(async () => {
    // Captured before the local optimistic mutation below, which updates `item` in place --
    // using the post-mutation quantity here would double-count this tap's own delta on the
    // first sync attempt (see ItemQuantityDeltaPayload).
    const previousQuantity = item.quantity;
    const newQuantity = Math.max(1, previousQuantity + delta);
    const appliedDelta = newQuantity - previousQuantity;

    await item.update((i) => {
      i.quantity = newQuantity;
      i.synced = false;
    });

    const existing = await findUnsyncedQuantityAction(item.id);
    if (existing) {
      const payload = existing.parsedPayload as { delta: number; baseQuantity: number };
      await existing.update((a) => {
        a.payload = JSON.stringify({ ...payload, delta: payload.delta + appliedDelta });
      });
      return;
    }

    await enqueuePendingAction({
      actionType: appliedDelta >= 0 ? 'ITEM_QUANTITY_INCREMENT' : 'ITEM_QUANTITY_DECREMENT',
      entityType: 'shopping_list_item',
      entityLocalId: item.id,
      shoppingListLocalId: item.shoppingListId,
      payload: { delta: appliedDelta, baseQuantity: previousQuantity },
      baseVersion: item.version,
    });
  });
}

/** If the item never made it to the backend, cancels its CREATE_ITEM action and destroys the
 * local row with no network call. Otherwise records a DELETE_ITEM action (capturing server ids
 * up front, since the row is about to be removed) and destroys the local row for an optimistic
 * removal from the UI. */
export async function deleteShoppingListItemOffline(item: ShoppingListItem): Promise<void> {
  await database.write(async () => {
    const unsyncedCreate = await findUnsyncedCreateAction(item.id);
    if (unsyncedCreate) {
      await unsyncedCreate.destroyPermanently();
      await deletePendingActionsForEntity(item.id);
      await item.destroyPermanently();
      return;
    }

    const list = await item.shoppingList.fetch();

    if (!item.serverId || !list.serverId) {
      // Should be unreachable (an item with no unsynced create action must have a server_id),
      // but guards against deleting an item the backend has never heard of.
      await item.destroyPermanently();
      return;
    }

    await enqueuePendingAction({
      actionType: 'DELETE_ITEM',
      entityType: 'shopping_list_item',
      entityLocalId: item.id,
      shoppingListLocalId: item.shoppingListId,
      payload: { itemServerId: item.serverId, shoppingListServerId: list.serverId },
    });

    await item.destroyPermanently();
  });
}

export function findShoppingListItemsForList(shoppingListLocalId: string) {
  return shoppingListItems().query(Q.where('shopping_list_id', shoppingListLocalId));
}
