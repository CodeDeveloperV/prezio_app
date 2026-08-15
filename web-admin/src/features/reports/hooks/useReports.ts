import { useQuery } from '@tanstack/react-query';

import { getReport, getReports, getReportsSummary } from '../api/reportsApi';

import type { ReportFilters } from '../api/reportsApi';

export function useReportsSummary(storeId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'reports', 'summary'],
    queryFn: () => getReportsSummary(storeId as number),
    enabled: storeId !== null,
  });
}

export function useReports(storeId: number | null, filters: ReportFilters) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'reports', filters],
    queryFn: () => getReports(storeId as number, filters),
    enabled: storeId !== null,
  });
}

export function useReport(storeId: number | null, reportId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'reports', 'detail', reportId],
    queryFn: () => getReport(storeId as number, reportId as number),
    enabled: storeId !== null && reportId !== null,
  });
}
