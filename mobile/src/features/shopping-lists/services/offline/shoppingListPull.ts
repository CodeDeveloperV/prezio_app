import { Q } from '@nozbe/watermelondb';

import { database } from '../../../../shared/services/db/database';
import { hasUnresolvedActionForEntity } from '../../../../shared/services/db/pendingActionQueue';
import { listShoppingLists, listShoppingListItems } from '../../api/shoppingListsApi';

import type ShoppingList from '../../../../shared/services/db/models/ShoppingList';
import type ShoppingListItem from '../../../../shared/services/db/models/ShoppingListItem';

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');

/**
 * Pulls authoritative server state into WatermelonDB. Scoped refetches (not a global incremental
 * sync) are enough for this Epic -- see design point 13. Pull only ever upserts or removes a
 * record that is fully synced and has no PendingAction of its own, so it can never clobber an
 * offline edit the SyncEngine hasn't replayed yet.
 */

export async function pullShoppingLists(): Promise<void> {
  const remoteLists = await listShoppingLists();
  const localLists = await shoppingLists().query().fetch();
  const localBySeverId = new Map(
    localLists.filter((list) => list.serverId).map((list) => [list.serverId as string, list]),
  );

  await database.write(async () => {
    for (const remote of remoteLists) {
      const existing = localBySeverId.get(String(remote.id));
      if (existing) {
        if (existing.name !== remote.name) {
          await existing.update((list) => {
            list.name = remote.name;
            list.ownerUserId = String(remote.owner_user_id);
            list.synced = true;
          });
        }
        continue;
      }

      await shoppingLists().create((list) => {
        list.serverId = String(remote.id);
        list.name = remote.name;
        list.ownerUserId = String(remote.owner_user_id);
        list.synced = true;
      });
    }

    // Drops a locally-cached list no longer returned by the backend (archived or deleted), as
    // long as it isn't mid-sync -- this endpoint only ever returns active lists, matching the
    // pre-Epic-14 "Mis listas" behavior of only showing active lists.
    const remoteIds = new Set(remoteLists.map((remote) => String(remote.id)));
    for (const local of localLists) {
      if (!local.serverId || remoteIds.has(local.serverId)) {
        continue;
      }
      if (await hasUnresolvedActionForEntity(local.id)) {
        continue;
      }
      await local.destroyPermanently();
    }
  });
}

export async function pullShoppingListItems(listLocalId: string, listServerId: number): Promise<void> {
  const remoteItems = await listShoppingListItems(listServerId);
  const localItems = await shoppingListItems().query(Q.where('shopping_list_id', listLocalId)).fetch();
  const localByServerId = new Map(
    localItems.filter((item) => item.serverId).map((item) => [item.serverId as string, item]),
  );

  await database.write(async () => {
    for (const remote of remoteItems) {
      const existing = localByServerId.get(String(remote.id));
      if (existing) {
        // A pending action still owns this item (SyncEngine hasn't replayed it, or it's stuck in
        // conflict) -- let that resolve instead of overwriting it from underneath.
        if (existing.version < remote.version && !(await hasUnresolvedActionForEntity(existing.id))) {
          await existing.update((item) => {
            item.quantity = remote.quantity;
            item.checked = remote.checked;
            item.version = remote.version;
            item.addedBy = String(remote.added_by);
            item.synced = true;
          });
        }
        continue;
      }

      await shoppingListItems().create((item) => {
        item.serverId = String(remote.id);
        item.shoppingListId = listLocalId;
        item.productId = String(remote.product_id);
        // The backend doesn't denormalize a product name onto the item yet, and the product
        // cache (Task 7) isn't wired in here -- same placeholder the manual add-item UI uses.
        item.productName = `Producto #${remote.product_id}`;
        item.quantity = remote.quantity;
        item.checked = remote.checked;
        item.addedBy = String(remote.added_by);
        item.version = remote.version;
        item.synced = true;
      });
    }

    const remoteIds = new Set(remoteItems.map((remote) => String(remote.id)));
    for (const local of localItems) {
      if (!local.serverId || remoteIds.has(local.serverId)) {
        continue;
      }
      if (await hasUnresolvedActionForEntity(local.id)) {
        continue;
      }
      await local.destroyPermanently();
    }
  });
}
