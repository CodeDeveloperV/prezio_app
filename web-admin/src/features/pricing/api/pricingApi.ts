import { HTTPError } from 'ky';

import { httpClient } from '@/shared/services/api/httpClient';

import type {
  Availability,
  B2BBatchUpdateRequest,
  B2BBatchUpdateResponse,
  B2BPriceConflictRead,
  B2BPriceUpdateRequest,
  PriceHistoryRead,
  PricingListItemRead,
} from '@prezio/shared-types';

export interface PricingFilters {
  branch_id?: number;
  category_id?: number;
  availability?: Availability;
  name?: string;
  barcode?: string;
  stale_before?: string;
  include_inactive?: boolean;
}

function toSearchParams(filters: PricingFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.branch_id !== undefined) params.branch_id = String(filters.branch_id);
  if (filters.category_id !== undefined) params.category_id = String(filters.category_id);
  if (filters.availability) params.availability = filters.availability;
  if (filters.name) params.name = filters.name;
  if (filters.barcode) params.barcode = filters.barcode;
  if (filters.stale_before) params.stale_before = filters.stale_before;
  if (filters.include_inactive) params.include_inactive = String(filters.include_inactive);
  return params;
}

/** Thrown by `updatePricingStoreProduct` on HTTP 409 -- carries the server's current
 * price/availability/version so the caller can offer "usar precio actual" without a refetch. */
export class PriceConflictError extends Error {
  conflict: B2BPriceConflictRead;

  constructor(conflict: B2BPriceConflictRead) {
    super(conflict.detail);
    this.conflict = conflict;
  }
}

export function getPricing(storeId: number, filters: PricingFilters): Promise<PricingListItemRead[]> {
  return httpClient
    .get(`b2b/organizations/${storeId}/pricing/store-products`, { searchParams: toSearchParams(filters) })
    .json<PricingListItemRead[]>();
}

export function getPricingHistory(storeId: number, storeProductId: number): Promise<PriceHistoryRead[]> {
  return httpClient
    .get(`b2b/organizations/${storeId}/pricing/store-products/${storeProductId}/history`)
    .json<PriceHistoryRead[]>();
}

export async function updatePricingStoreProduct(
  storeId: number,
  storeProductId: number,
  payload: B2BPriceUpdateRequest,
): Promise<PricingListItemRead> {
  try {
    return await httpClient
      .patch(`b2b/organizations/${storeId}/pricing/store-products/${storeProductId}`, { json: payload })
      .json<PricingListItemRead>();
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 409) {
      throw new PriceConflictError(await error.response.json<B2BPriceConflictRead>());
    }
    throw error;
  }
}

export function batchUpdatePricing(storeId: number, payload: B2BBatchUpdateRequest): Promise<B2BBatchUpdateResponse> {
  return httpClient
    .post(`b2b/organizations/${storeId}/pricing/batch`, { json: payload })
    .json<B2BBatchUpdateResponse>();
}
