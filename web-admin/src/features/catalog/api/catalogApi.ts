import { httpClient } from '@/shared/services/api/httpClient';

import type {
  Brand,
  BranchListingRead,
  Category,
  CatalogProductDetail,
  CatalogProductSummary,
  CreateListingRequest,
  ModerationStatus,
  UpdateListingStatusRequest,
} from '@prezio/shared-types';

export interface CatalogProductFilters {
  name?: string;
  barcode?: string;
  brand_id?: number;
  category_id?: number;
  status?: ModerationStatus;
}

function toSearchParams(filters: CatalogProductFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.name) params.name = filters.name;
  if (filters.barcode) params.barcode = filters.barcode;
  if (filters.brand_id !== undefined) params.brand_id = String(filters.brand_id);
  if (filters.category_id !== undefined) params.category_id = String(filters.category_id);
  if (filters.status) params.status = filters.status;
  return params;
}

export function getCatalogProducts(
  storeId: number,
  filters: CatalogProductFilters,
): Promise<CatalogProductSummary[]> {
  return httpClient
    .get(`b2b/organizations/${storeId}/catalog/products`, { searchParams: toSearchParams(filters) })
    .json<CatalogProductSummary[]>();
}

export function getCatalogProduct(storeId: number, productId: number): Promise<CatalogProductDetail> {
  return httpClient
    .get(`b2b/organizations/${storeId}/catalog/products/${productId}`)
    .json<CatalogProductDetail>();
}

export function createCatalogProductListings(
  storeId: number,
  productId: number,
  payload: CreateListingRequest,
): Promise<BranchListingRead[]> {
  return httpClient
    .post(`b2b/organizations/${storeId}/catalog/products/${productId}/branches`, { json: payload })
    .json<BranchListingRead[]>();
}

export function updateCatalogProductListing(
  storeId: number,
  productId: number,
  branchId: number,
  payload: UpdateListingStatusRequest,
): Promise<BranchListingRead> {
  return httpClient
    .patch(`b2b/organizations/${storeId}/catalog/products/${productId}/branches/${branchId}`, { json: payload })
    .json<BranchListingRead>();
}

export function getCategories(): Promise<Category[]> {
  return httpClient.get('catalog/categories').json<Category[]>();
}

export function getBrands(): Promise<Brand[]> {
  return httpClient.get('catalog/brands').json<Brand[]>();
}
