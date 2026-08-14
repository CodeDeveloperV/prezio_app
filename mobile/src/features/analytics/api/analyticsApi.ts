import { httpClient } from '../../../shared/services/api/httpClient';

import type { AnalyticsPeriod, AnalyticsSummary } from '@prezio/shared-types';

export function getAnalyticsSummary(period: AnalyticsPeriod): Promise<AnalyticsSummary> {
  return httpClient.get('analytics/summary', { searchParams: { period } }).json<AnalyticsSummary>();
}
