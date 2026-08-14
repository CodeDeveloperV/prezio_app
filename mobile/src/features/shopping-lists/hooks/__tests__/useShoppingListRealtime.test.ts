import { Q } from '@nozbe/watermelondb';

import { resetDatabase } from '../../../../shared/services/db/testUtils/resetDatabase';
import { database } from '../../../../shared/services/db/database';
import {
  changeItemQuantityOffline,
  createShoppingListOffline,
} from '../../services/offline/offlineShoppingListActions';
import { applyItemEvent } from '../useShoppingListRealtime';

import type ShoppingList from '../../../../shared/services/db/models/ShoppingList';
import type ShoppingListItem from '../../../../shared/services/db/models/ShoppingListItem';
import type { ShoppingListItemEvent } from '@prezio/shared-types';

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');

beforeEach(resetDatabase);

function makeEvent(overrides: Partial<ShoppingListItemEvent> & { version: number | null }): ShoppingListItemEvent {
  return {
    event_type: 'item_updated',
    shopping_list_id: 1,
    entity_id: overrides.payload?.id ?? 1,
    timestamp: '2026-01-01T00:00:00Z',
    payload: {
      id: 1,
      shopping_list_id: 1,
      product_id: 1,
      quantity: 1,
      checked: false,
      added_by: 1,
      version: overrides.version ?? 1,
      checked_at: null,
      price_at_check: null,
      store_branch_id: null,
    },
    ...overrides,
  };
}

async function createSyncedItem(serverId: string, quantity: number, version: number) {
  return database.write(async () => {
    const list = await shoppingLists().create((l) => {
      l.serverId = '1';
      l.name = 'Supermercado';
      l.ownerUserId = '1';
      l.synced = true;
    });
    const item = await shoppingListItems().create((i) => {
      i.serverId = serverId;
      i.shoppingListId = list.id;
      i.productId = '1';
      i.productName = 'Leche';
      i.quantity = quantity;
      i.checked = false;
      i.addedBy = '1';
      i.version = version;
      i.synced = true;
    });
    return { list, item };
  });
}

// Spec point 15: "WebSocket actualiza Watermelon cuando online"
test('an item_updated event writes the server state into WatermelonDB', async () => {
  const { list, item } = await createSyncedItem('50', 1, 1);

  await applyItemEvent(
    list.id,
    makeEvent({
      version: 2,
      payload: {
        id: 50,
        shopping_list_id: 1,
        product_id: 1,
        quantity: 3,
        checked: true,
        added_by: 1,
        version: 2,
        checked_at: null,
        price_at_check: null,
        store_branch_id: null,
      },
    }),
  );

  const refreshed = await shoppingListItems().find(item.id);
  expect(refreshed.quantity).toBe(3);
  expect(refreshed.checked).toBe(true);
  expect(refreshed.version).toBe(2);
});

// Spec point 15: "WebSocket actualiza Watermelon cuando online" (item_added creates a new local row)
test('an item_added event for an unknown server item creates a local row', async () => {
  const list = await createShoppingListOffline('Supermercado');

  await applyItemEvent(
    list.id,
    makeEvent({
      event_type: 'item_added',
      version: 1,
      payload: {
        id: 999,
        shopping_list_id: 1,
        product_id: 5,
        quantity: 2,
        checked: false,
        added_by: 1,
        version: 1,
        checked_at: null,
        price_at_check: null,
        store_branch_id: null,
      },
    }),
  );

  const items = await shoppingListItems().query(Q.where('shopping_list_id', list.id)).fetch();
  expect(items).toHaveLength(1);
  expect(items[0].serverId).toBe('999');
  expect(items[0].synced).toBe(true);
});

// Spec point 15: "evento WebSocket viejo no pisa versión local más nueva"
test('drops a stale event whose version is behind the local record', async () => {
  const { list, item } = await createSyncedItem('60', 5, 7);

  await applyItemEvent(
    list.id,
    makeEvent({
      version: 3,
      payload: {
        id: 60,
        shopping_list_id: 1,
        product_id: 1,
        quantity: 1,
        checked: true,
        added_by: 1,
        version: 3,
        checked_at: null,
        price_at_check: null,
        store_branch_id: null,
      },
    }),
  );

  const refreshed = await shoppingListItems().find(item.id);
  expect(refreshed.quantity).toBe(5);
  expect(refreshed.version).toBe(7);
  expect(refreshed.checked).toBe(false);
});

// Spec point 15: "evento WebSocket viejo no pisa versión local más nueva" (also true while a
// PendingAction still owns the record, regardless of version)
test('drops any event for a record a PendingAction still owns, even with a newer version', async () => {
  const { list, item } = await createSyncedItem('70', 2, 1);
  await changeItemQuantityOffline(item, 1);

  await applyItemEvent(
    list.id,
    makeEvent({
      version: 99,
      payload: {
        id: 70,
        shopping_list_id: 1,
        product_id: 1,
        quantity: 40,
        checked: true,
        added_by: 2,
        version: 99,
        checked_at: null,
        price_at_check: null,
        store_branch_id: null,
      },
    }),
  );

  const refreshed = await shoppingListItems().find(item.id);
  expect(refreshed.quantity).toBe(3);
  expect(refreshed.checked).toBe(false);
});
