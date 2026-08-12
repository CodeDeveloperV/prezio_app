import { useQuery } from '@tanstack/react-query';

import { listAlerts } from '../api/alertsApi';

import type { PriceAlertRead } from '@prezio/shared-types';

export function useAlertsQuery() {
  return useQuery<PriceAlertRead[], Error>({
    queryKey: ['alerts'],
    queryFn: listAlerts,
  });
}
