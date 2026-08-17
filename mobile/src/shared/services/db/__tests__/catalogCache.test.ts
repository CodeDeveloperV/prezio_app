import { resetDatabase } from '../testUtils/resetDatabase';
import { cacheScanResult, findCachedBarcode } from '../catalogCache';

import type { ScanFoundResult } from '@prezio/shared-types';

beforeEach(resetDatabase);

function makeScanResult(overrides: Partial<{ productId: number; barcodeId: number; price: number }> = {}): ScanFoundResult {
  return {
    status: 'found',
    barcode_id: overrides.barcodeId ?? 10,
    product: {
      id: overrides.productId ?? 1,
      canonical_name: 'Leche entera 1L',
      brand_name: 'Estrella Azul',
      presentation: '1L',
      image_url: null,
      status: 'approved',
    },
    store_product: {
      id: 20,
      store_branch_id: 5,
      product_id: overrides.productId ?? 1,
      current_price: overrides.price ?? 1.5,
      currency: 'USD',
      version: 1,
      availability: 'in_stock',
      last_verified_at: '2026-01-01T00:00:00Z',
      last_verified_by: 1,
    },
    price_offers: [],
  };
}

// Spec point 15: "price cache funciona offline"
test('a previously scanned barcode resolves from the local cache with no network call', async () => {
  const result = makeScanResult();
  await cacheScanResult(result, '7501234567890', 'ean13');

  const match = await findCachedBarcode('7501234567890', 5);

  expect(match).not.toBeNull();
  expect(match!.product.canonicalName).toBe('Leche entera 1L');
  expect(match!.storeProduct?.currentPrice).toBe(1.5);
  expect(match!.storeProduct?.version).toBe(1);
});

// Spec point 15: "producto no cacheado requiere conexión"
test('an uncached barcode resolves to null instead of a partial/incorrect match', async () => {
  const match = await findCachedBarcode('0000000000000', 5);
  expect(match).toBeNull();
});

test('an uncached barcode stays unresolved even when a different barcode/store is cached', async () => {
  await cacheScanResult(makeScanResult(), '7501234567890', 'ean13');

  const wrongBarcode = await findCachedBarcode('9999999999999', 5);
  expect(wrongBarcode).toBeNull();

  // Cached at store branch 5 only; a different branch has no cached price for it.
  const wrongBranch = await findCachedBarcode('7501234567890', 99);
  expect(wrongBranch).not.toBeNull();
  expect(wrongBranch!.storeProduct).toBeNull();
});
