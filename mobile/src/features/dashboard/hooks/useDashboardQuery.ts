import { useQuery } from '@tanstack/react-query';

import { getDashboardSummary } from '../api/dashboardApi';

import type { DashboardSummary } from '@prezio/shared-types';

export function useDashboardQuery() {
  return useQuery<DashboardSummary, Error>({
    queryKey: ['dashboardSummary'],
    queryFn: getDashboardSummary,
  });
}
