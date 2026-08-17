import { HTTPError } from 'ky';

import { httpClient } from '@/shared/services/api/httpClient';

import type {
  CouponCreate,
  CouponDisplayStatus,
  CouponListRead,
  CouponRead,
  CouponStatus,
  CouponType,
  CouponUpdate,
} from '@prezio/shared-types';

export interface CouponFilters {
  name?: string;
  status_filter?: CouponStatus;
  type?: CouponType;
  branch_id?: number;
  product_id?: number;
  display_status?: CouponDisplayStatus;
  page?: number;
  page_size?: number;
}

function toSearchParams(filters: CouponFilters): Record<string, string> {
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

/** Thrown on any 4xx from the coupons endpoints -- carries the backend's `detail` message
 * (e.g. "At least one branch must be selected"). */
export class CouponActionError extends Error {}

async function unwrapDetail(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const body = await error.response.json<{ detail?: string }>().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : null;
    throw new CouponActionError(detail ?? 'No se pudo completar la acción.');
  }
  throw error;
}

export function getCoupons(storeId: number, filters: CouponFilters): Promise<CouponListRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/coupons`, { searchParams: toSearchParams(filters) })
    .json<CouponListRead>();
}

export function getCoupon(storeId: number, couponId: number): Promise<CouponRead> {
  return httpClient.get(`b2b/organizations/${storeId}/coupons/${couponId}`).json<CouponRead>();
}

export async function createCoupon(storeId: number, payload: CouponCreate): Promise<CouponRead> {
  try {
    return await httpClient.post(`b2b/organizations/${storeId}/coupons`, { json: payload }).json<CouponRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function updateCoupon(storeId: number, couponId: number, payload: CouponUpdate): Promise<CouponRead> {
  try {
    return await httpClient
      .patch(`b2b/organizations/${storeId}/coupons/${couponId}`, { json: payload })
      .json<CouponRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function publishCoupon(storeId: number, couponId: number): Promise<CouponRead> {
  try {
    return await httpClient.post(`b2b/organizations/${storeId}/coupons/${couponId}/publish`).json<CouponRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function cancelCoupon(storeId: number, couponId: number): Promise<CouponRead> {
  try {
    return await httpClient.post(`b2b/organizations/${storeId}/coupons/${couponId}/cancel`).json<CouponRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function deleteCoupon(storeId: number, couponId: number): Promise<void> {
  try {
    await httpClient.delete(`b2b/organizations/${storeId}/coupons/${couponId}`);
  } catch (error) {
    await unwrapDetail(error);
  }
}
