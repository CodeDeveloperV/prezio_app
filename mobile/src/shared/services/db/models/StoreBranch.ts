import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Read-only cache of a StoreBranch. `id` is the backend's numeric branch id, stringified. */
export default class StoreBranch extends Model {
  static table = 'store_branches';

  @field('store_id') storeId!: string;
  @field('name') name!: string;
  @field('city') city!: string;
  @field('cached_at') cachedAt!: number;
}
