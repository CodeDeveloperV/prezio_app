import { httpClient } from '../../../shared/services/api/httpClient';

import type {
  PriceHistoryRead,
  PriceUpdateRequest,
  StoreProductRead,
} from '@prezio/shared-types';

export interface StoreProductCreateRequest {
  product_id: number;
  store_branch_id: number;
  current_price: number;
}

/** Registers the first observed price for a product at a specific branch. */
export function createStoreProductPrice(
  request: StoreProductCreateRequest,
): Promise<StoreProductRead> {
  return httpClient
    .post('pricing/store-products', { json: request })
    .json<StoreProductRead>();
}

export function confirmStoreProductMatch(
  storeProductId: number,
): Promise<StoreProductRead> {
  return httpClient
    .post(`pricing/store-products/${storeProductId}/confirm`)
    .json<StoreProductRead>();
}

export function updateStoreProductPrice(
  storeProductId: number,
  request: PriceUpdateRequest,
): Promise<StoreProductRead> {
  return httpClient
    .post(`pricing/store-products/${storeProductId}/price`, { json: request })
    .json<StoreProductRead>();
}

export function getStoreProductPriceHistory(
  storeProductId: number,
): Promise<PriceHistoryRead[]> {
  return httpClient
    .get(`pricing/store-products/${storeProductId}/history`)
    .json<PriceHistoryRead[]>();
}
