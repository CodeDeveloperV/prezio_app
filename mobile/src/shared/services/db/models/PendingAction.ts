import { Model } from '@nozbe/watermelondb';
import { date, field } from '@nozbe/watermelondb/decorators';

/** Offline mutation queue entry — action_type + JSON payload, replayed once
 * connectivity returns. Replay/sync engine itself is not implemented here. */
export default class PendingAction extends Model {
  static table = 'pending_actions';

  @field('action_type') actionType!: string;
  @field('payload') payload!: string;
  @field('synced') synced!: boolean;
  @date('created_at') createdAt!: Date;

  get parsedPayload(): unknown {
    return JSON.parse(this.payload);
  }
}
