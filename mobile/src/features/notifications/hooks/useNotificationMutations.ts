import { useMutation, useQueryClient } from '@tanstack/react-query';

import { markAllNotificationsRead, markNotificationRead } from '../api/notificationsApi';

import type { MarkAllReadResponse, NotificationRead } from '@prezio/shared-types';

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation<NotificationRead, Error, number>({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation<MarkAllReadResponse, Error, void>({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
