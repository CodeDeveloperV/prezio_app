import { httpClient } from '../../../shared/services/api/httpClient';

import type { DashboardSummary, UserBudgetRead, UserBudgetUpdate } from '@prezio/shared-types';

export function getDashboardSummary(): Promise<DashboardSummary> {
  return httpClient.get('dashboard/summary').json<DashboardSummary>();
}

export function updateMonthlyBudget(request: UserBudgetUpdate): Promise<UserBudgetRead> {
  return httpClient.patch('users/me/budget', { json: request }).json<UserBudgetRead>();
}
