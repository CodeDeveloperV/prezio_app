import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Read-only cache of a StoreProduct -- a price *snapshot*, not a guarantee of the current
 * price. The UI must use `cachedAt`/`lastVerifiedAt` to tell the user a cached price may be
 * stale; offline price edits are out of scope for this epic. `id` is the backend's numeric
 * store_product id, stringified. */
export default class StoreProduct extends Model {
  static table = 'store_products';

  @field('store_branch_id') storeBranchId!: string;
  @field('product_id') productId!: string;
  @field('current_price') currentPrice!: number;
  @field('currency') currency!: string;
  @field('version') version!: number;
  @field('availability') availability!: string;
  @field('last_verified_at') lastVerifiedAt!: number | null;
  @field('cached_at') cachedAt!: number;
}
