import { Model } from '@nozbe/watermelondb';
import { date, field } from '@nozbe/watermelondb/decorators';

import type {
  PendingActionEntityType,
  PendingActionPayload,
  PendingActionStatus,
  PendingActionType,
} from '../pendingActionTypes';

/**
 * Durable offline mutation queue entry. SyncEngine replays PENDING rows in `sequence` order (a
 * monotonic enqueue counter -- `created_at` alone is millisecond-resolution and can tie), which
 * respects causality via `shoppingListLocalId` (never replay an item action before its list's
 * own CREATE_LIST action has reached `synced`). A row is only ever removed after the backend has
 * confirmed success -- see SyncEngine.markSynced.
 */
export default class PendingAction extends Model {
  static table = 'pending_actions';

  @field('action_type') actionType!: PendingActionType;
  @field('entity_type') entityType!: PendingActionEntityType;
  @field('entity_local_id') entityLocalId!: string;
  @field('shopping_list_local_id') shoppingListLocalId!: string | null;
  @field('payload') payload!: string;
  @field('base_version') baseVersion!: number | null;
  @field('status') status!: PendingActionStatus;
  @field('retry_count') retryCount!: number;
  @field('last_error') lastError!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @field('synced_at') syncedAt!: number | null;
  @field('sequence') sequence!: number;

  get parsedPayload(): PendingActionPayload {
    return JSON.parse(this.payload) as PendingActionPayload;
  }
}
