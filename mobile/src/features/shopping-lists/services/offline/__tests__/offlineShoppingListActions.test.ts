import { Q } from '@nozbe/watermelondb';

import { resetDatabase } from '../../../../../shared/services/db/testUtils/resetDatabase';
import { database } from '../../../../../shared/services/db/database';
import PendingAction from '../../../../../shared/services/db/models/PendingAction';
import {
  addShoppingListItemOffline,
  createShoppingListOffline,
  findShoppingListItemsForList,
} from '../offlineShoppingListActions';

import type ShoppingList from '../../../../../shared/services/db/models/ShoppingList';

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const pendingActions = () => database.get<PendingAction>('pending_actions');

beforeEach(resetDatabase);

// Spec point 15: "crear lista offline"
test('creates a shopping list locally and enqueues a CREATE_LIST pending action', async () => {
  const list = await createShoppingListOffline('Supermercado');

  expect(list.synced).toBe(false);
  expect(list.serverId).toBeNull();

  const allLists = await shoppingLists().query().fetch();
  expect(allLists).toHaveLength(1);

  const actions = await pendingActions().query().fetch();
  expect(actions).toHaveLength(1);
  expect(actions[0].actionType).toBe('CREATE_LIST');
  expect(actions[0].status).toBe('pending');
  expect(actions[0].entityLocalId).toBe(list.id);
  expect(actions[0].parsedPayload).toEqual({ name: 'Supermercado' });
});

// Spec point 15: "agregar varios items offline"
test('adds several items to a list locally, each with its own CREATE_ITEM pending action', async () => {
  const list = await createShoppingListOffline('Supermercado');

  const item1 = await addShoppingListItemOffline({
    shoppingListLocalId: list.id,
    productId: 'prod-1',
    productName: 'Leche',
    quantity: 2,
  });
  const item2 = await addShoppingListItemOffline({
    shoppingListLocalId: list.id,
    productId: 'prod-2',
    productName: 'Pan',
    quantity: 1,
  });

  const items = await findShoppingListItemsForList(list.id).fetch();
  expect(items.map((item) => item.id).sort()).toEqual([item1.id, item2.id].sort());
  expect(items.every((item) => item.synced === false)).toBe(true);

  const createItemActions = await pendingActions()
    .query(Q.where('action_type', 'CREATE_ITEM'))
    .fetch();
  expect(createItemActions).toHaveLength(2);
  expect(createItemActions.map((action) => action.entityLocalId).sort()).toEqual(
    [item1.id, item2.id].sort(),
  );
});

// Spec point 15: "cerrar/reabrir app y conservar acciones". A real app restart re-opens the
// native SQLite file; the closest equivalent under Jest's in-memory LokiJS adapter is proving the
// queue lives in the WatermelonDB table itself (not a JS variable the offline actions module
// happens to hold onto) by re-querying it from scratch, the same way SyncEngine does on its own.
test('keeps pending actions queryable from the database after the in-memory references are dropped', async () => {
  await createShoppingListOffline('Supermercado');

  const reloadedActions = await database
    .get<PendingAction>('pending_actions')
    .query(Q.where('status', 'pending'))
    .fetch();

  expect(reloadedActions).toHaveLength(1);
  expect(reloadedActions[0].actionType).toBe('CREATE_LIST');
});
