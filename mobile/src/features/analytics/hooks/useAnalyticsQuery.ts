import { useQuery } from '@tanstack/react-query';

import { getAnalyticsSummary } from '../api/analyticsApi';

import type { AnalyticsPeriod, AnalyticsSummary } from '@prezio/shared-types';

export function useAnalyticsQuery(period: AnalyticsPeriod) {
  return useQuery<AnalyticsSummary, Error>({
    queryKey: ['analyticsSummary', period],
    queryFn: () => getAnalyticsSummary(period),
  });
}
