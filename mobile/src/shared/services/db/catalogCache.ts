import { Q, type Model } from '@nozbe/watermelondb';

import { database } from './database';
import Product from './models/Product';
import ProductBarcode from './models/ProductBarcode';
import StoreProduct from './models/StoreProduct';

import type { ScanFoundResult, StoreProductRead } from '@prezio/shared-types';

const products = () => database.get<Product>('products');
const productBarcodes = () => database.get<ProductBarcode>('product_barcodes');
const storeProducts = () => database.get<StoreProduct>('store_products');

/**
 * Creates or updates a cache row keyed by the backend's own numeric id (stringified), via
 * WatermelonDB's `prepareCreateFromDirtyRaw` -- the same mechanism its own sync adapter uses to
 * create records with a server-assigned id, rather than a locally-generated one. This is what
 * lets ShoppingListItem.product_id/StoreProduct.product_id reference these rows directly, with
 * no separate local<->server id mapping table.
 */
async function upsertById<T extends Model>(
  collection: ReturnType<typeof database.get<T>>,
  id: string,
  applyFields: (record: T) => void,
): Promise<void> {
  let record: T | null = null;
  try {
    record = await collection.find(id);
  } catch {
    record = null;
  }

  await database.write(async () => {
    if (record) {
      await record!.update(applyFields);
    } else {
      const created = collection.prepareCreateFromDirtyRaw({ id });
      await database.batch(created);
      await created.update(applyFields);
    }
  });
}

/**
 * Caches the outcome of a *successful* online barcode scan/price lookup, scoped to exactly the
 * product/price the user just touched -- never a bulk catalog download. `id` on the cached
 * Product/StoreProduct/ProductBarcode rows equals the backend's numeric id (stringified), so a
 * later cache read needs no separate id-mapping table.
 */
export async function cacheScanResult(
  result: ScanFoundResult,
  barcode: string,
  barcodeType: string,
): Promise<void> {
  const now = Date.now();
  const { product, store_product: storeProduct } = result;

  await upsertById(products(), String(product.id), (record) => {
    record.canonicalName = product.canonical_name;
    record.brandName = product.brand_name;
    record.presentation = product.presentation;
    record.imageUrl = product.image_url;
    record.cachedAt = now;
  });

  await upsertById(productBarcodes(), String(result.barcode_id), (record) => {
    record.productId = String(product.id);
    record.barcode = barcode;
    record.barcodeType = barcodeType;
    record.storeId = null;
    record.cachedAt = now;
  });

  if (storeProduct) {
    await cacheStoreProduct(storeProduct);
  }
}

/** Refreshes a cached price snapshot after an online-only confirm/price-update action, so the
 * next offline read reflects the latest known price rather than a stale scan-time value. */
export async function cacheStoreProduct(storeProduct: StoreProductRead): Promise<void> {
  const now = Date.now();
  await upsertById(storeProducts(), String(storeProduct.id), (record) => {
    record.storeBranchId = String(storeProduct.store_branch_id);
    record.productId = String(storeProduct.product_id);
    record.currentPrice = storeProduct.current_price;
    record.currency = storeProduct.currency;
    record.version = storeProduct.version;
    record.availability = storeProduct.availability;
    record.lastVerifiedAt = storeProduct.last_verified_at ? new Date(storeProduct.last_verified_at).getTime() : null;
    record.cachedAt = now;
  });
}

export interface CachedScanMatch {
  barcodeId: number;
  product: Product;
  storeProduct: StoreProduct | null;
}

/**
 * Offline-first barcode resolution: looks up an already-cached barcode instead of re-running the
 * backend's Catalog Resolution Engine client-side. Only ever returns a product this user has
 * previously scanned/used -- an unknown barcode legitimately requires a connection.
 */
export async function findCachedBarcode(
  barcode: string,
  storeBranchId: number,
): Promise<CachedScanMatch | null> {
  const [cachedBarcode] = await productBarcodes().query(Q.where('barcode', barcode)).fetch();
  if (!cachedBarcode) {
    return null;
  }

  let product: Product;
  try {
    product = await products().find(cachedBarcode.productId);
  } catch {
    return null;
  }

  const [cachedStoreProduct] = await storeProducts()
    .query(Q.where('product_id', cachedBarcode.productId), Q.where('store_branch_id', String(storeBranchId)))
    .fetch();

  return {
    barcodeId: Number(cachedBarcode.id),
    product,
    storeProduct: cachedStoreProduct ?? null,
  };
}
