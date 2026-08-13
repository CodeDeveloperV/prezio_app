import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Read-only cache of a ProductAlias -- feeds offline manual search/matching, never used as an
 * identity key. `id` is the backend's numeric alias id, stringified. */
export default class ProductAlias extends Model {
  static table = 'product_aliases';

  @field('product_id') productId!: string;
  @field('alias') alias!: string;
  @field('language') language!: string;
  @field('cached_at') cachedAt!: number;
}
