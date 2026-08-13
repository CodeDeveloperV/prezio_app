import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Read-only cache of a Store -- just enough context to label a cached price/branch offline.
 * `id` is the backend's numeric store id, stringified. */
export default class Store extends Model {
  static table = 'stores';

  @field('name') name!: string;
  @field('country') country!: string;
  @field('cached_at') cachedAt!: number;
}
