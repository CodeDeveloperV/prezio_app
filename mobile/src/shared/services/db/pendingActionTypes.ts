export type PendingActionStatus = 'pending' | 'syncing' | 'failed' | 'conflict' | 'synced';

export type PendingActionEntityType = 'shopping_list' | 'shopping_list_item';

/**
 * One entry per offline-editable mutation actually reachable from the UI (see
 * ShoppingListDetailScreen/ShoppingListsScreen). Quantity changes are modeled as increment/
 * decrement deltas rather than an absolute set specifically so a 409 during replay can be
 * resolved by re-applying the delta on top of the server's current quantity instead of
 * overwriting a value someone else may have changed too -- see SyncEngine's conflict
 * resolution, one branch per action type.
 */
export type PendingActionType =
  | 'CREATE_LIST'
  | 'CREATE_ITEM'
  | 'ITEM_QUANTITY_INCREMENT'
  | 'ITEM_QUANTITY_DECREMENT'
  | 'ITEM_CHECKED_SET'
  | 'DELETE_ITEM';

export interface CreateListPayload {
  name: string;
}

export interface CreateItemPayload {
  productId: string;
  productName: string;
  quantity: number;
}

export interface ItemQuantityDeltaPayload {
  delta: number;
  // Quantity as last known synced (captured when this action -- or the first of a merged run
  // of taps made before ever reconnecting -- was enqueued). The *first* sync attempt sends
  // `baseQuantity + delta`; a 409 rebases onto the server's authoritative current quantity
  // instead of trusting this stale value. See SyncEngine.
  baseQuantity: number;
}

export interface ItemCheckedSetPayload {
  checked: boolean;
}

export interface DeleteItemPayload {
  // Captured at enqueue time, before the local record is destroyed for the optimistic UI
  // removal -- SyncEngine has nothing else to look these up from afterwards.
  itemServerId: string;
  shoppingListServerId: string;
}

export type PendingActionPayload =
  | CreateListPayload
  | CreateItemPayload
  | ItemQuantityDeltaPayload
  | ItemCheckedSetPayload
  | DeleteItemPayload
  | Record<string, never>;
