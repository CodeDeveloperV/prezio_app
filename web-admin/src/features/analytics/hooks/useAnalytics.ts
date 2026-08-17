import { useQuery } from '@tanstack/react-query';

import {
  getActivityFeed,
  getAvailabilityAnalytics,
  getCouponsAnalytics,
  getOverview,
  getPricingAnalytics,
  getPromotionsAnalytics,
  getReportsAnalytics,
} from '../api/analyticsApi';

import type { AnalyticsRangeFilters } from '../api/analyticsApi';

function rangeKey(storeId: number | null, filters: AnalyticsRangeFilters) {
  return [storeId, filters.date_from, filters.date_to, (filters.branch_ids ?? []).join(',')] as const;
}

export function useOverview(storeId: number | null, filters: AnalyticsRangeFilters) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'overview', ...rangeKey(storeId, filters)],
    queryFn: () => getOverview(storeId as number, filters),
    enabled: storeId !== null,
  });
}

export function usePricingAnalytics(storeId: number | null, filters: AnalyticsRangeFilters) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'pricing', ...rangeKey(storeId, filters)],
    queryFn: () => getPricingAnalytics(storeId as number, filters),
    enabled: storeId !== null,
  });
}

export function useAvailabilityAnalytics(storeId: number | null, branchIds: number[]) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'availability', storeId, branchIds.join(',')],
    queryFn: () => getAvailabilityAnalytics(storeId as number, { branch_ids: branchIds }),
    enabled: storeId !== null,
  });
}

export function usePromotionsAnalytics(storeId: number | null, branchIds: number[]) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'promotions', storeId, branchIds.join(',')],
    queryFn: () => getPromotionsAnalytics(storeId as number, { branch_ids: branchIds }),
    enabled: storeId !== null,
  });
}

export function useCouponsAnalytics(storeId: number | null, branchIds: number[]) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'coupons', storeId, branchIds.join(',')],
    queryFn: () => getCouponsAnalytics(storeId as number, { branch_ids: branchIds }),
    enabled: storeId !== null,
  });
}

export function useReportsAnalytics(storeId: number | null, filters: AnalyticsRangeFilters) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'reports', ...rangeKey(storeId, filters)],
    queryFn: () => getReportsAnalytics(storeId as number, filters),
    enabled: storeId !== null,
  });
}

export function useActivityFeed(storeId: number | null, filters: AnalyticsRangeFilters, limit = 50) {
  return useQuery({
    queryKey: ['b2b', 'analytics', 'activity', ...rangeKey(storeId, filters), limit],
    queryFn: () => getActivityFeed(storeId as number, filters, limit),
    enabled: storeId !== null,
  });
}
