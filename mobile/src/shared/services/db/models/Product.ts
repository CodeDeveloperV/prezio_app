import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Read-only cache of a backend Product, scoped to what the sync layer chose to cache (a
 * product used, scanned, or added to a list) -- never the full catalog. `id` is the backend's
 * numeric product id, stringified, so lookups from a ShoppingListItem/StoreProduct's
 * `product_id` need no separate mapping. */
export default class Product extends Model {
  static table = 'products';

  @field('canonical_name') canonicalName!: string;
  @field('brand_name') brandName!: string | null;
  @field('category_name') categoryName!: string | null;
  @field('presentation') presentation!: string | null;
  @field('image_url') imageUrl!: string | null;
  @field('cached_at') cachedAt!: number;
}
