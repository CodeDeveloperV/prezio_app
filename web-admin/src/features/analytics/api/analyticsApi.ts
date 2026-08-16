import { httpClient } from '@/shared/services/api/httpClient';

import type {
  ActivityFeedRead,
  AvailabilityAnalyticsRead,
  CouponsAnalyticsRead,
  OverviewRead,
  PricingAnalyticsRead,
  PromotionsAnalyticsRead,
  ReportsAnalyticsRead,
} from '@prezio/shared-types';

export interface AnalyticsRangeFilters {
  date_from?: string;
  date_to?: string;
  branch_ids?: number[];
}

function toSearchParams(filters: AnalyticsRangeFilters, extra?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  for (const branchId of filters.branch_ids ?? []) params.append('branch_ids', String(branchId));
  if (extra) for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params;
}

export function getOverview(storeId: number, filters: AnalyticsRangeFilters): Promise<OverviewRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/overview`, { searchParams: toSearchParams(filters) })
    .json<OverviewRead>();
}

export function getPricingAnalytics(storeId: number, filters: AnalyticsRangeFilters): Promise<PricingAnalyticsRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/pricing`, { searchParams: toSearchParams(filters) })
    .json<PricingAnalyticsRead>();
}

export function getAvailabilityAnalytics(
  storeId: number,
  filters: Pick<AnalyticsRangeFilters, 'branch_ids'>,
): Promise<AvailabilityAnalyticsRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/availability`, { searchParams: toSearchParams(filters) })
    .json<AvailabilityAnalyticsRead>();
}

export function getPromotionsAnalytics(
  storeId: number,
  filters: Pick<AnalyticsRangeFilters, 'branch_ids'>,
): Promise<PromotionsAnalyticsRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/promotions`, { searchParams: toSearchParams(filters) })
    .json<PromotionsAnalyticsRead>();
}

export function getCouponsAnalytics(
  storeId: number,
  filters: Pick<AnalyticsRangeFilters, 'branch_ids'>,
): Promise<CouponsAnalyticsRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/coupons`, { searchParams: toSearchParams(filters) })
    .json<CouponsAnalyticsRead>();
}

export function getReportsAnalytics(storeId: number, filters: AnalyticsRangeFilters): Promise<ReportsAnalyticsRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/reports`, { searchParams: toSearchParams(filters) })
    .json<ReportsAnalyticsRead>();
}

export function getActivityFeed(
  storeId: number,
  filters: AnalyticsRangeFilters,
  limit = 50,
): Promise<ActivityFeedRead> {
  return httpClient
    .get(`b2b/organizations/${storeId}/analytics/activity`, {
      searchParams: toSearchParams(filters, { limit: String(limit) }),
    })
    .json<ActivityFeedRead>();
}
