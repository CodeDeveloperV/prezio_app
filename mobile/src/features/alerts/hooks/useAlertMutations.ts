import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createAlert, deleteAlert, updateAlert } from '../api/alertsApi';

import type { PriceAlertCreateRequest, PriceAlertRead, PriceAlertUpdateRequest } from '@prezio/shared-types';

export function useCreateAlertMutation() {
  const queryClient = useQueryClient();
  return useMutation<PriceAlertRead, Error, PriceAlertCreateRequest>({
    mutationFn: createAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useUpdateAlertMutation() {
  const queryClient = useQueryClient();
  return useMutation<PriceAlertRead, Error, { alertId: number; request: PriceAlertUpdateRequest }>({
    mutationFn: ({ alertId, request }) => updateAlert(alertId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useDeleteAlertMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
