import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Read-only cache of a ProductBarcode -- lets the scanner resolve a known barcode to a Product
 * offline. `id` is the backend's numeric barcode id, stringified. */
export default class ProductBarcode extends Model {
  static table = 'product_barcodes';

  @field('product_id') productId!: string;
  @field('barcode') barcode!: string;
  @field('barcode_type') barcodeType!: string;
  @field('store_id') storeId!: string | null;
  @field('cached_at') cachedAt!: number;
}
