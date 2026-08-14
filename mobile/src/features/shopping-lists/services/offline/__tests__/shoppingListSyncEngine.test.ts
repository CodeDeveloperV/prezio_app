import { Q } from '@nozbe/watermelondb';
import { HTTPError } from 'ky';

import { resetDatabase } from '../../../../../shared/services/db/testUtils/resetDatabase';
import { database } from '../../../../../shared/services/db/database';
import PendingAction from '../../../../../shared/services/db/models/PendingAction';
import {
  addShoppingListItemOffline,
  changeItemQuantityOffline,
  createShoppingListOffline,
  deleteShoppingListItemOffline,
  findShoppingListItemsForList,
  setItemCheckedOffline,
} from '../offlineShoppingListActions';
import { runSync } from '../shoppingListSyncEngine';
import * as shoppingListsApi from '../../../api/shoppingListsApi';

import type ShoppingList from '../../../../../shared/services/db/models/ShoppingList';
import type ShoppingListItem from '../../../../../shared/services/db/models/ShoppingListItem';
import type {
  ShoppingList as ShoppingListDTO,
  ShoppingListItem as ShoppingListItemDTO,
  ShoppingListItemConflictResponse,
} from '@prezio/shared-types';

jest.mock('../../../api/shoppingListsApi');

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');
const pendingActions = () => database.get<PendingAction>('pending_actions');

const mockedCreateShoppingList = shoppingListsApi.createShoppingList as jest.MockedFunction<
  typeof shoppingListsApi.createShoppingList
>;
const mockedAddShoppingListItem = shoppingListsApi.addShoppingListItem as jest.MockedFunction<
  typeof shoppingListsApi.addShoppingListItem
>;
const mockedUpdateShoppingListItem = shoppingListsApi.updateShoppingListItem as jest.MockedFunction<
  typeof shoppingListsApi.updateShoppingListItem
>;
const mockedDeleteShoppingListItem = shoppingListsApi.deleteShoppingListItem as jest.MockedFunction<
  typeof shoppingListsApi.deleteShoppingListItem
>;

function makeListDto(overrides: Partial<ShoppingListDTO> & { id: number; name: string }): ShoppingListDTO {
  return {
    id: overrides.id,
    owner_user_id: overrides.owner_user_id ?? 1,
    name: overrides.name,
    status: overrides.status ?? 'active',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    active_store_branch_id: overrides.active_store_branch_id ?? null,
  };
}

function makeItemDto(overrides: Partial<ShoppingListItemDTO> & { id: number }): ShoppingListItemDTO {
  return {
    id: overrides.id,
    shopping_list_id: overrides.shopping_list_id ?? 1,
    product_id: overrides.product_id ?? 1,
    quantity: overrides.quantity ?? 1,
    checked: overrides.checked ?? false,
    added_by: overrides.added_by ?? 1,
    version: overrides.version ?? 1,
    checked_at: overrides.checked_at ?? null,
    price_at_check: overrides.price_at_check ?? null,
    store_branch_id: overrides.store_branch_id ?? null,
  };
}

function makeHttpError(status: number, body: unknown): HTTPError {
  const response = { status, statusText: '', json: async () => body } as unknown as Response;
  const request = { method: 'PATCH', url: 'https://test.local/x' } as unknown as Request;
  return new HTTPError(response, request, {} as never);
}

let nextServerId = 100;

/** Bypasses the CREATE_LIST/CREATE_ITEM flow to set up a list+item pair that's already synced,
 * so quantity/checked/delete replay logic can be tested in isolation. */
async function createSyncedListAndItem(
  overrides: Partial<{ quantity: number; checked: boolean; version: number }> = {},
) {
  const listServerId = String(nextServerId++);
  const itemServerId = String(nextServerId++);

  return database.write(async () => {
    const list = await shoppingLists().create((l) => {
      l.serverId = listServerId;
      l.name = 'Supermercado';
      l.ownerUserId = '1';
      l.synced = true;
    });
    const item = await shoppingListItems().create((i) => {
      i.serverId = itemServerId;
      i.shoppingListId = list.id;
      i.productId = 'prod-1';
      i.productName = 'Leche';
      i.quantity = overrides.quantity ?? 2;
      i.checked = overrides.checked ?? false;
      i.addedBy = '1';
      i.version = overrides.version ?? 1;
      i.synced = true;
    });
    return { list, item };
  });
}

beforeEach(async () => {
  await resetDatabase();
  jest.resetAllMocks();
});

// Spec point 15: "create list + create item dependiente" (causal ordering)
test('replays CREATE_LIST before its dependent CREATE_ITEM', async () => {
  const callOrder: string[] = [];
  mockedCreateShoppingList.mockImplementation(async (payload) => {
    callOrder.push('createShoppingList');
    return makeListDto({ id: 700, name: payload.name });
  });
  mockedAddShoppingListItem.mockImplementation(async () => {
    callOrder.push('addShoppingListItem');
    return makeItemDto({ id: 800, quantity: 2, version: 1 });
  });

  const list = await createShoppingListOffline('Supermercado');
  const item = await addShoppingListItemOffline({
    shoppingListLocalId: list.id,
    productId: '1',
    productName: 'Leche',
    quantity: 2,
  });

  await runSync();

  expect(callOrder).toEqual(['createShoppingList', 'addShoppingListItem']);
  expect(mockedAddShoppingListItem).toHaveBeenCalledWith(700, {
    product_id: 1,
    quantity: 2,
    client_request_id: item.id,
  });

  const refreshedList = await shoppingLists().find(list.id);
  const refreshedItem = await shoppingListItems().find(item.id);
  expect(refreshedList.synced).toBe(true);
  expect(refreshedList.serverId).toBe('700');
  expect(refreshedItem.synced).toBe(true);
  expect(refreshedItem.serverId).toBe('800');

  const actions = await pendingActions().query().fetch();
  expect(actions.every((action) => action.status === 'synced')).toBe(true);
});

// Spec point 15: "replay secuencial"
test('replays queued actions strictly in FIFO order across different entities', async () => {
  const callOrder: string[] = [];
  mockedCreateShoppingList.mockImplementation(async (payload) => {
    callOrder.push(`createList:${payload.name}`);
    return makeListDto({ id: callOrder.length, name: payload.name });
  });
  mockedAddShoppingListItem.mockImplementation(async () => {
    callOrder.push('addItem');
    return makeItemDto({ id: 999, quantity: 1, version: 1 });
  });

  const listA = await createShoppingListOffline('Lista A');
  await addShoppingListItemOffline({
    shoppingListLocalId: listA.id,
    productId: '1',
    productName: 'Leche',
    quantity: 1,
  });
  await createShoppingListOffline('Lista B');

  await runSync();

  expect(callOrder).toEqual(['createList:Lista A', 'addItem', 'createList:Lista B']);
});

// Spec point 15: "quantity delta con 409 y rebase"
test('rebases a pending quantity delta onto the server version after a 409 conflict', async () => {
  const { list, item } = await createSyncedListAndItem({ quantity: 2, version: 3 });
  const listServerId = Number(list.serverId);
  const itemServerId = Number(item.serverId);

  await changeItemQuantityOffline(item, 1);

  const conflictBody: ShoppingListItemConflictResponse = {
    detail: 'stale version',
    item: makeItemDto({ id: itemServerId, quantity: 5, version: 9 }),
  };
  mockedUpdateShoppingListItem
    .mockRejectedValueOnce(makeHttpError(409, conflictBody))
    .mockResolvedValueOnce(makeItemDto({ id: itemServerId, quantity: 6, version: 10 }));

  await runSync();

  expect(mockedUpdateShoppingListItem).toHaveBeenCalledTimes(2);
  // First attempt sends the locally-known base quantity (2) plus the +1 intent.
  expect(mockedUpdateShoppingListItem).toHaveBeenNthCalledWith(1, listServerId, itemServerId, {
    version: 3,
    quantity: 3,
  });
  // Rebased onto the server's authoritative quantity (5), same +1 intent, not the stale base.
  expect(mockedUpdateShoppingListItem).toHaveBeenNthCalledWith(2, listServerId, itemServerId, {
    version: 9,
    quantity: 6,
  });

  const refreshedItem = await shoppingListItems().find(item.id);
  expect(refreshedItem.quantity).toBe(6);
  expect(refreshedItem.version).toBe(10);
  expect(refreshedItem.synced).toBe(true);

  const [action] = await pendingActions().query().fetch();
  expect(action.status).toBe('synced');
});

// Spec point 15: "checked SET con 409" (case: intent already achieved remotely)
test('resolves a checked-set 409 without a second call when intent already matches', async () => {
  const { item } = await createSyncedListAndItem({ checked: false, version: 4 });
  const itemServerId = Number(item.serverId);
  await setItemCheckedOffline(item, true);

  const conflictBody: ShoppingListItemConflictResponse = {
    detail: 'stale version',
    item: makeItemDto({ id: itemServerId, checked: true, quantity: 2, version: 8 }),
  };
  mockedUpdateShoppingListItem.mockRejectedValueOnce(makeHttpError(409, conflictBody));

  await runSync();

  expect(mockedUpdateShoppingListItem).toHaveBeenCalledTimes(1);
  const refreshedItem = await shoppingListItems().find(item.id);
  expect(refreshedItem.checked).toBe(true);
  expect(refreshedItem.version).toBe(8);

  const [action] = await pendingActions().query().fetch();
  expect(action.status).toBe('synced');
});

// Spec point 15: "checked SET con 409" (case: intent still differs -> corrective retry)
test('retries a checked-set 409 with the corrected version when intent still differs', async () => {
  const { item } = await createSyncedListAndItem({ checked: false, version: 4 });
  const listServerId = Number((await shoppingLists().find(item.shoppingListId)).serverId);
  const itemServerId = Number(item.serverId);
  await setItemCheckedOffline(item, true);

  const conflictBody: ShoppingListItemConflictResponse = {
    detail: 'stale version',
    item: makeItemDto({ id: itemServerId, checked: false, quantity: 2, version: 8 }),
  };
  mockedUpdateShoppingListItem
    .mockRejectedValueOnce(makeHttpError(409, conflictBody))
    .mockResolvedValueOnce(makeItemDto({ id: itemServerId, checked: true, quantity: 2, version: 9 }));

  await runSync();

  expect(mockedUpdateShoppingListItem).toHaveBeenCalledTimes(2);
  expect(mockedUpdateShoppingListItem).toHaveBeenNthCalledWith(2, listServerId, itemServerId, {
    version: 8,
    checked: true,
  });

  const refreshedItem = await shoppingListItems().find(item.id);
  expect(refreshedItem.checked).toBe(true);
  expect(refreshedItem.version).toBe(9);
});

// Spec point 15: "delete remoto + delete local = éxito idempotente"
test('treats a 404 on delete as an idempotent success', async () => {
  const { list, item } = await createSyncedListAndItem();
  const listServerId = Number(list.serverId);
  const itemServerId = Number(item.serverId);

  await deleteShoppingListItemOffline(item);
  mockedDeleteShoppingListItem.mockRejectedValueOnce(makeHttpError(404, {}));

  await runSync();

  expect(mockedDeleteShoppingListItem).toHaveBeenCalledWith(listServerId, itemServerId);
  const [action] = await pendingActions().query().fetch();
  expect(action.status).toBe('synced');
});

// Spec point 15: "update local sobre item eliminado remotamente = CONFLICT"
test('marks an update against a remotely-deleted item as an unresolvable conflict, and keeps replaying', async () => {
  const { item: conflictItem } = await createSyncedListAndItem({ quantity: 2, version: 1 });
  await changeItemQuantityOffline(conflictItem, 1);

  const { item: healthyItem } = await createSyncedListAndItem({ checked: false, version: 1 });
  await setItemCheckedOffline(healthyItem, true);

  mockedUpdateShoppingListItem.mockImplementation(async (_listId, itemId) => {
    if (itemId === Number(conflictItem.serverId)) {
      throw makeHttpError(404, {});
    }
    return makeItemDto({ id: Number(healthyItem.serverId), checked: true, quantity: 1, version: 2 });
  });

  await runSync();

  const [conflictAction] = await pendingActions()
    .query(Q.where('entity_local_id', conflictItem.id))
    .fetch();
  expect(conflictAction.status).toBe('conflict');
  expect(conflictAction.lastError).toMatch(/deleted remotely/);

  const [healthyAction] = await pendingActions().query(Q.where('entity_local_id', healthyItem.id)).fetch();
  expect(healthyAction.status).toBe('synced');
});

// Spec point 15: "no duplicar items después de reintentos"
test('does not duplicate the item or its pending action across a failed-then-retried CREATE_ITEM', async () => {
  mockedCreateShoppingList.mockResolvedValueOnce(makeListDto({ id: 700, name: 'Supermercado' }));
  const list = await createShoppingListOffline('Supermercado');
  await runSync();

  const item = await addShoppingListItemOffline({
    shoppingListLocalId: list.id,
    productId: '9',
    productName: 'Huevos',
    quantity: 1,
  });

  mockedAddShoppingListItem.mockRejectedValueOnce(new Error('Network request failed'));
  await runSync();

  let items = await findShoppingListItemsForList(list.id).fetch();
  expect(items).toHaveLength(1);
  let createItemActions = await pendingActions().query(Q.where('action_type', 'CREATE_ITEM')).fetch();
  expect(createItemActions).toHaveLength(1);
  expect(createItemActions[0].status).toBe('failed');

  mockedAddShoppingListItem.mockResolvedValueOnce(makeItemDto({ id: 800, quantity: 1, version: 1 }));
  await runSync();

  items = await findShoppingListItemsForList(list.id).fetch();
  expect(items).toHaveLength(1);
  expect(items[0].serverId).toBe('800');

  createItemActions = await pendingActions().query(Q.where('action_type', 'CREATE_ITEM')).fetch();
  expect(createItemActions).toHaveLength(1);
  expect(createItemActions[0].status).toBe('synced');

  expect(mockedAddShoppingListItem).toHaveBeenCalledTimes(2);
  expect(mockedAddShoppingListItem).toHaveBeenNthCalledWith(1, 700, {
    product_id: 9,
    quantity: 1,
    client_request_id: item.id,
  });
  expect(mockedAddShoppingListItem).toHaveBeenNthCalledWith(2, 700, {
    product_id: 9,
    quantity: 1,
    client_request_id: item.id,
  });
});

// Spec point 15: "pérdida de conexión durante sync" + "reintento posterior completa la cola sin duplicados"
test('stops replay on a network error and finishes on retry without duplicating pending actions', async () => {
  const listA = await createShoppingListOffline('Lista A');
  const listB = await createShoppingListOffline('Lista B');

  mockedCreateShoppingList.mockRejectedValueOnce(new Error('Network request failed'));
  await runSync();

  expect(mockedCreateShoppingList).toHaveBeenCalledTimes(1);

  const actionsAfterFirstRun = await pendingActions().query(Q.sortBy('sequence', Q.asc)).fetch();
  expect(actionsAfterFirstRun).toHaveLength(2);
  expect(actionsAfterFirstRun[0].status).toBe('failed');
  expect(actionsAfterFirstRun[0].retryCount).toBe(1);
  expect(actionsAfterFirstRun[1].status).toBe('pending');

  mockedCreateShoppingList
    .mockResolvedValueOnce(makeListDto({ id: 501, name: 'Lista A' }))
    .mockResolvedValueOnce(makeListDto({ id: 502, name: 'Lista B' }));
  await runSync();

  expect(mockedCreateShoppingList).toHaveBeenCalledTimes(3);

  const actionsAfterRetry = await pendingActions().query().fetch();
  expect(actionsAfterRetry).toHaveLength(2);
  expect(actionsAfterRetry.every((action) => action.status === 'synced')).toBe(true);

  const refreshedListA = await shoppingLists().find(listA.id);
  const refreshedListB = await shoppingLists().find(listB.id);
  expect(refreshedListA.serverId).toBe('501');
  expect(refreshedListB.serverId).toBe('502');
});
