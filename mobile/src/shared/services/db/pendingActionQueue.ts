import { Q } from '@nozbe/watermelondb';

import { database } from './database';
import PendingAction from './models/PendingAction';
import type {
  PendingActionEntityType,
  PendingActionPayload,
  PendingActionType,
} from './pendingActionTypes';

const pendingActions = () => database.get<PendingAction>('pending_actions');

/** Must be called from within an already-open `database.write()` block -- see
 * offlineShoppingListActions.ts, which always enqueues the action in the same write transaction
 * as the local record it affects, so the two are never out of sync with each other. */
export async function enqueuePendingAction(params: {
  actionType: PendingActionType;
  entityType: PendingActionEntityType;
  entityLocalId: string;
  shoppingListLocalId?: string | null;
  payload: PendingActionPayload;
  baseVersion?: number | null;
}): Promise<PendingAction> {
  // `created_at` alone can't order two actions enqueued in the same millisecond, which breaks
  // causal FIFO replay -- this counter can't race since callers always run inside the same
  // `database.write()` as this read (see the class doc comment).
  const [lastBySequence] = await pendingActions().query(Q.sortBy('sequence', Q.desc), Q.take(1)).fetch();
  const nextSequence = (lastBySequence?.sequence ?? 0) + 1;

  return pendingActions().create((action) => {
    action.actionType = params.actionType;
    action.entityType = params.entityType;
    action.entityLocalId = params.entityLocalId;
    action.shoppingListLocalId = params.shoppingListLocalId ?? null;
    action.payload = JSON.stringify(params.payload);
    action.baseVersion = params.baseVersion ?? null;
    action.status = 'pending';
    action.retryCount = 0;
    action.lastError = null;
    action.syncedAt = null;
    action.sequence = nextSequence;
  });
}

/** Actions still owed a sync attempt, oldest first -- this FIFO order is what preserves
 * causality (a list's CREATE_LIST is always enqueued before any action on its items), so the
 * replay loop needs no separate dependency graph. */
export function listReplayableActions(): Promise<PendingAction[]> {
  return pendingActions()
    .query(Q.where('status', Q.oneOf(['pending', 'failed'])), Q.sortBy('sequence', Q.asc))
    .fetch();
}

export function countUnresolvedActions(): Promise<number> {
  return pendingActions().query(Q.where('status', Q.oneOf(['pending', 'syncing', 'failed', 'conflict']))).fetchCount();
}

export function countConflictedActions(): Promise<number> {
  return pendingActions().query(Q.where('status', 'conflict')).fetchCount();
}

export async function markSyncing(action: PendingAction): Promise<void> {
  await database.write(async () => {
    await action.update((a) => {
      a.status = 'syncing';
    });
  });
}

export async function markSynced(action: PendingAction): Promise<void> {
  await database.write(async () => {
    await action.update((a) => {
      a.status = 'synced';
      a.syncedAt = Date.now();
      a.lastError = null;
    });
  });
}

export async function markFailed(action: PendingAction, error: string): Promise<void> {
  await database.write(async () => {
    await action.update((a) => {
      a.status = 'failed';
      a.retryCount = a.retryCount + 1;
      a.lastError = error;
    });
  });
}

export async function markConflict(action: PendingAction, error: string): Promise<void> {
  await database.write(async () => {
    await action.update((a) => {
      a.status = 'conflict';
      a.lastError = error;
    });
  });
}

/** Finds a not-yet-synced CREATE_ITEM/CREATE_LIST action for the given entity, if any -- used
 * to cancel a create+delete pair entirely offline instead of round-tripping to the backend. */
export async function findUnsyncedCreateAction(entityLocalId: string): Promise<PendingAction | null> {
  const [action] = await pendingActions()
    .query(
      Q.where('entity_local_id', entityLocalId),
      Q.where('action_type', Q.oneOf(['CREATE_LIST', 'CREATE_ITEM'])),
      // Deliberately excludes 'syncing': an action mid network-call is left to finish rather
      // than cancelled out from under it.
      Q.where('status', Q.oneOf(['pending', 'failed'])),
    )
    .fetch();
  return action ?? null;
}

/** Finds a not-yet-synced quantity-delta action for the item, if any -- lets repeated +/- taps
 * made before ever reconnecting merge into a single action instead of one per tap. */
export async function findUnsyncedQuantityAction(entityLocalId: string): Promise<PendingAction | null> {
  const [action] = await pendingActions()
    .query(
      Q.where('entity_local_id', entityLocalId),
      Q.where('action_type', Q.oneOf(['ITEM_QUANTITY_INCREMENT', 'ITEM_QUANTITY_DECREMENT'])),
      Q.where('status', Q.oneOf(['pending', 'failed'])),
    )
    .fetch();
  return action ?? null;
}

/** True while an entity has any action that hasn't reached a terminal `synced` state --
 * background pulls (see shoppingListPull.ts) must not overwrite a record the SyncEngine still
 * owns, whether or not the action is currently mid-flight. */
export async function hasUnresolvedActionForEntity(entityLocalId: string): Promise<boolean> {
  const count = await pendingActions()
    .query(
      Q.where('entity_local_id', entityLocalId),
      Q.where('status', Q.notEq('synced')),
    )
    .fetchCount();
  return count > 0;
}

export async function deletePendingActionsForEntity(entityLocalId: string): Promise<void> {
  const actions = await pendingActions().query(Q.where('entity_local_id', entityLocalId)).fetch();
  await database.batch(...actions.map((action) => action.prepareDestroyPermanently()));
}
