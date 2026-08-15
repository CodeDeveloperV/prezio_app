import { HTTPError } from 'ky';

import { httpClient } from '@/shared/services/api/httpClient';

import type {
  ReportAssignRequest,
  ReportDismissRequest,
  ReportListRead,
  ReportPriority,
  ReportPriorityUpdate,
  ReportRead,
  ReportResolveRequest,
  ReportStatus,
  ReportSummaryRead,
  ReportType,
} from '@prezio/shared-types';

export interface ReportFilters {
  status_filter?: ReportStatus;
  type?: ReportType;
  priority?: ReportPriority;
  branch_id?: number;
  product_id?: number;
  store_product_id?: number;
  assigned_to_user_id?: number;
  unassigned?: boolean;
  only_open?: boolean;
  date_from?: string;
  date_to?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

function toSearchParams(filters: ReportFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.status_filter) params.status_filter = filters.status_filter;
  if (filters.type) params.type = filters.type;
  if (filters.priority) params.priority = filters.priority;
  if (filters.branch_id !== undefined) params.branch_id = String(filters.branch_id);
  if (filters.product_id !== undefined) params.product_id = String(filters.product_id);
  if (filters.store_product_id !== undefined) params.store_product_id = String(filters.store_product_id);
  if (filters.assigned_to_user_id !== undefined) params.assigned_to_user_id = String(filters.assigned_to_user_id);
  if (filters.unassigned) params.unassigned = 'true';
  if (filters.only_open) params.only_open = 'true';
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.sort) params.sort = filters.sort;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.page_size !== undefined) params.page_size = String(filters.page_size);
  return params;
}

/** Thrown on any 4xx from the reports endpoints -- carries the backend's `detail` message
 * (e.g. an invalid status transition). */
export class ReportActionError extends Error {}

async function unwrapDetail(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const body = await error.response.json<{ detail?: string }>().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : null;
    throw new ReportActionError(detail ?? 'No se pudo completar la acción.');
  }
  throw error;
}

export function getReportsSummary(storeId: number): Promise<ReportSummaryRead> {
  return httpClient.get(`b2b/organizations/${storeId}/reports/summary`).json<ReportSummaryRead>();
}

export function getReports(storeId: number, filters: ReportFilters): Promise<ReportListRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/reports`, { searchParams: toSearchParams(filters) })
    .json<ReportListRead>();
}

export function getReport(storeId: number, reportId: number): Promise<ReportRead> {
  return httpClient.get(`b2b/organizations/${storeId}/reports/${reportId}`).json<ReportRead>();
}

export async function takeReport(storeId: number, reportId: number): Promise<ReportRead> {
  try {
    return await httpClient.post(`b2b/organizations/${storeId}/reports/${reportId}/take`).json<ReportRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function assignReport(
  storeId: number,
  reportId: number,
  payload: ReportAssignRequest,
): Promise<ReportRead> {
  try {
    return await httpClient
      .post(`b2b/organizations/${storeId}/reports/${reportId}/assign`, { json: payload })
      .json<ReportRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function updateReportPriority(
  storeId: number,
  reportId: number,
  payload: ReportPriorityUpdate,
): Promise<ReportRead> {
  try {
    return await httpClient
      .patch(`b2b/organizations/${storeId}/reports/${reportId}/priority`, { json: payload })
      .json<ReportRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function markReportInReview(storeId: number, reportId: number): Promise<ReportRead> {
  try {
    return await httpClient
      .patch(`b2b/organizations/${storeId}/reports/${reportId}/status`, { json: { status: 'in_review' } })
      .json<ReportRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function resolveReport(
  storeId: number,
  reportId: number,
  payload: ReportResolveRequest,
): Promise<ReportRead> {
  try {
    return await httpClient
      .post(`b2b/organizations/${storeId}/reports/${reportId}/resolve`, { json: payload })
      .json<ReportRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function dismissReport(
  storeId: number,
  reportId: number,
  payload: ReportDismissRequest,
): Promise<ReportRead> {
  try {
    return await httpClient
      .post(`b2b/organizations/${storeId}/reports/${reportId}/dismiss`, { json: payload })
      .json<ReportRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}
