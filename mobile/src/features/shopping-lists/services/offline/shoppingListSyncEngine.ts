import { HTTPError } from 'ky';

import { database } from '../../../../shared/services/db/database';
import {
  listReplayableActions,
  markConflict,
  markFailed,
  markSynced,
  markSyncing,
} from '../../../../shared/services/db/pendingActionQueue';
import {
  addShoppingListItem,
  createShoppingList,
  deleteShoppingListItem,
  updateShoppingListItem,
} from '../../api/shoppingListsApi';

import type PendingAction from '../../../../shared/services/db/models/PendingAction';
import type ShoppingList from '../../../../shared/services/db/models/ShoppingList';
import type ShoppingListItem from '../../../../shared/services/db/models/ShoppingListItem';
import type {
  CreateItemPayload,
  CreateListPayload,
  DeleteItemPayload,
  ItemCheckedSetPayload,
  ItemQuantityDeltaPayload,
} from '../../../../shared/services/db/pendingActionTypes';
import type {
  ShoppingListItem as ShoppingListItemDTO,
  ShoppingListItemConflictResponse,
} from '@prezio/shared-types';

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');
const shoppingListItems = () => database.get<ShoppingListItem>('shopping_list_items');

/**
 * Raised when replay determines the conflict cannot be safely auto-resolved (e.g. a local
 * update against an item the server says is gone). Unlike any other error, this one does NOT
 * halt the run: it carries no causal risk for later actions, so the action is parked as
 * `conflict` and replay moves on to the next one. Every other thrown error is treated as
 * transient and stops the whole run, since a later action may depend on this one having synced.
 */
class UnresolvableConflict extends Error {}

let inFlight: Promise<void> | null = null;

/** Entry point for every sync trigger (NetInfo reconnect, foreground, app start, manual retry).
 * Concurrent callers share the same in-flight run instead of racing two replays. */
export function runSync(): Promise<void> {
  if (!inFlight) {
    inFlight = performSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function performSync(): Promise<void> {
  const actions = await listReplayableActions();

  for (const action of actions) {
    await markSyncing(action);
    try {
      await replayOne(action);
      await markSynced(action);
    } catch (error) {
      if (error instanceof UnresolvableConflict) {
        await markConflict(action, error.message);
        continue;
      }
      await markFailed(action, describeError(error));
      return;
    }
  }
}

async function replayOne(action: PendingAction): Promise<void> {
  switch (action.actionType) {
    case 'CREATE_LIST':
      return replayCreateList(action);
    case 'CREATE_ITEM':
      return replayCreateItem(action);
    case 'ITEM_QUANTITY_INCREMENT':
    case 'ITEM_QUANTITY_DECREMENT':
      return replayItemQuantityDelta(action);
    case 'ITEM_CHECKED_SET':
      return replayItemCheckedSet(action);
    case 'DELETE_ITEM':
      return replayDeleteItem(action);
    default:
      throw new Error(`Unknown pending action type: ${action.actionType}`);
  }
}

async function replayCreateList(action: PendingAction): Promise<void> {
  const payload = action.parsedPayload as CreateListPayload;
  const list = await shoppingLists().find(action.entityLocalId);

  // The local id doubles as the client_request_id: a retried CREATE_LIST after a dropped
  // response returns the already-created list instead of a duplicate (see backend
  // ShoppingListService.create).
  const created = await createShoppingList({ name: payload.name, client_request_id: list.id });

  await database.write(async () => {
    await list.update((l) => {
      l.serverId = String(created.id);
      l.ownerUserId = String(created.owner_user_id);
      l.synced = true;
    });
  });
}

async function replayCreateItem(action: PendingAction): Promise<void> {
  const payload = action.parsedPayload as CreateItemPayload;
  const item = await shoppingListItems().find(action.entityLocalId);
  const list = await shoppingLists().find(item.shoppingListId);

  if (!list.serverId) {
    // Unreachable under normal FIFO causal replay (the list's CREATE_LIST always precedes this
    // action) -- treated as transient rather than silently dropped.
    throw new Error('Parent shopping list is not synced yet');
  }

  const created = await addShoppingListItem(Number(list.serverId), {
    product_id: Number(payload.productId),
    quantity: payload.quantity,
    client_request_id: item.id,
  });

  await applyServerItem(item, created);
}

async function replayItemQuantityDelta(action: PendingAction): Promise<void> {
  const payload = action.parsedPayload as ItemQuantityDeltaPayload;
  const item = await shoppingListItems().find(action.entityLocalId);
  const list = await shoppingLists().find(item.shoppingListId);

  if (!item.serverId || !list.serverId) {
    throw new Error('Item is not synced yet');
  }

  const desiredQuantity = Math.max(1, payload.baseQuantity + payload.delta);

  try {
    const updated = await updateShoppingListItem(Number(list.serverId), Number(item.serverId), {
      version: action.baseVersion ?? item.version,
      quantity: desiredQuantity,
    });
    await applyServerItem(item, updated);
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 404) {
      throw new UnresolvableConflict('Item was deleted remotely; local quantity change dropped');
    }
    if (error instanceof HTTPError && error.response.status === 409) {
      const conflict = (await error.response.json()) as ShoppingListItemConflictResponse;
      // Rebase the delta onto the server's authoritative quantity instead of trusting our stale
      // baseQuantity -- preserves "increment by N" intent without overwriting a concurrent edit.
      const rebased = Math.max(1, conflict.item.quantity + payload.delta);
      const updated = await updateShoppingListItem(Number(list.serverId), Number(item.serverId), {
        version: conflict.item.version,
        quantity: rebased,
      });
      await applyServerItem(item, updated);
      return;
    }
    throw error;
  }
}

async function replayItemCheckedSet(action: PendingAction): Promise<void> {
  const payload = action.parsedPayload as ItemCheckedSetPayload;
  const item = await shoppingListItems().find(action.entityLocalId);
  const list = await shoppingLists().find(item.shoppingListId);

  if (!item.serverId || !list.serverId) {
    throw new Error('Item is not synced yet');
  }

  try {
    const updated = await updateShoppingListItem(Number(list.serverId), Number(item.serverId), {
      version: action.baseVersion ?? item.version,
      checked: payload.checked,
    });
    await applyServerItem(item, updated);
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 404) {
      throw new UnresolvableConflict('Item was deleted remotely; local checked change dropped');
    }
    if (error instanceof HTTPError && error.response.status === 409) {
      const conflict = (await error.response.json()) as ShoppingListItemConflictResponse;
      if (conflict.item.checked === payload.checked) {
        // Intent already achieved (e.g. another member checked it too) -- resolved, not a conflict.
        await applyServerItem(item, conflict.item);
        return;
      }
      const updated = await updateShoppingListItem(Number(list.serverId), Number(item.serverId), {
        version: conflict.item.version,
        checked: payload.checked,
      });
      await applyServerItem(item, updated);
      return;
    }
    throw error;
  }
}

async function replayDeleteItem(action: PendingAction): Promise<void> {
  const payload = action.parsedPayload as DeleteItemPayload;

  try {
    await deleteShoppingListItem(Number(payload.shoppingListServerId), Number(payload.itemServerId));
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 404) {
      // Already gone remotely (e.g. another device deleted it first) -- idempotent success.
      return;
    }
    throw error;
  }
}

/** Writes the server's authoritative item state back onto the local row. Never called with a
 * stale WebSocket event -- see useShoppingListRealtime (Task 6), which compares `version` before
 * applying any remote update to WatermelonDB. */
async function applyServerItem(item: ShoppingListItem, dto: ShoppingListItemDTO): Promise<void> {
  await database.write(async () => {
    await item.update((i) => {
      i.serverId = String(dto.id);
      i.quantity = dto.quantity;
      i.checked = dto.checked;
      i.addedBy = String(dto.added_by);
      i.version = dto.version;
      i.synced = true;
    });
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown sync error';
}
