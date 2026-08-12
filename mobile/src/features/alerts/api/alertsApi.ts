import { httpClient } from '../../../shared/services/api/httpClient';

import type { PriceAlertCreateRequest, PriceAlertRead, PriceAlertUpdateRequest } from '@prezio/shared-types';

export function listAlerts(): Promise<PriceAlertRead[]> {
  return httpClient.get('alerts').json<PriceAlertRead[]>();
}

export function createAlert(request: PriceAlertCreateRequest): Promise<PriceAlertRead> {
  return httpClient.post('alerts', { json: request }).json<PriceAlertRead>();
}

export function updateAlert(alertId: number, request: PriceAlertUpdateRequest): Promise<PriceAlertRead> {
  return httpClient.patch(`alerts/${alertId}`, { json: request }).json<PriceAlertRead>();
}

export function deleteAlert(alertId: number): Promise<void> {
  return httpClient.delete(`alerts/${alertId}`).then(() => undefined);
}
