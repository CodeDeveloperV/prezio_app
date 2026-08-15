import { HTTPError } from 'ky';

import { httpClient } from '@/shared/services/api/httpClient';

import type {
  PromotionCreate,
  PromotionDisplayStatus,
  PromotionListRead,
  PromotionRead,
  PromotionStatus,
  PromotionType,
  PromotionUpdate,
} from '@prezio/shared-types';

export interface PromotionFilters {
  name?: string;
  status_filter?: PromotionStatus;
  type?: PromotionType;
  branch_id?: number;
  product_id?: number;
  display_status?: PromotionDisplayStatus;
  page?: number;
  page_size?: number;
}

function toSearchParams(filters: PromotionFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.name) params.name = filters.name;
  if (filters.status_filter) params.status_filter = filters.status_filter;
  if (filters.type) params.type = filters.type;
  if (filters.branch_id !== undefined) params.branch_id = String(filters.branch_id);
  if (filters.product_id !== undefined) params.product_id = String(filters.product_id);
  if (filters.display_status) params.display_status = filters.display_status;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.page_size !== undefined) params.page_size = String(filters.page_size);
  return params;
}

/** Thrown on any 4xx from the promotions endpoints -- carries the backend's `detail` message
 * (e.g. "Promotion must have at least one product and one branch to publish"). */
export class PromotionActionError extends Error {}

async function unwrapDetail(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const body = await error.response.json<{ detail?: string }>().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : null;
    throw new PromotionActionError(detail ?? 'No se pudo completar la acción.');
  }
  throw error;
}

export function getPromotions(storeId: number, filters: PromotionFilters): Promise<PromotionListRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/promotions`, { searchParams: toSearchParams(filters) })
    .json<PromotionListRead>();
}

export function getPromotion(storeId: number, promotionId: number): Promise<PromotionRead> {
  return httpClient.get(`b2b/organizations/${storeId}/promotions/${promotionId}`).json<PromotionRead>();
}

export async function createPromotion(storeId: number, payload: PromotionCreate): Promise<PromotionRead> {
  try {
    return await httpClient.post(`b2b/organizations/${storeId}/promotions`, { json: payload }).json<PromotionRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function updatePromotion(
  storeId: number,
  promotionId: number,
  payload: PromotionUpdate,
): Promise<PromotionRead> {
  try {
    return await httpClient
      .patch(`b2b/organizations/${storeId}/promotions/${promotionId}`, { json: payload })
      .json<PromotionRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function publishPromotion(storeId: number, promotionId: number): Promise<PromotionRead> {
  try {
    return await httpClient
      .post(`b2b/organizations/${storeId}/promotions/${promotionId}/publish`)
      .json<PromotionRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function cancelPromotion(storeId: number, promotionId: number): Promise<PromotionRead> {
  try {
    return await httpClient
      .post(`b2b/organizations/${storeId}/promotions/${promotionId}/cancel`)
      .json<PromotionRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function deletePromotion(storeId: number, promotionId: number): Promise<void> {
  try {
    await httpClient.delete(`b2b/organizations/${storeId}/promotions/${promotionId}`);
  } catch (error) {
    await unwrapDetail(error);
  }
}
