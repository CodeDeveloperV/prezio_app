import { useQuery } from '@tanstack/react-query';

import { listNotifications } from '../api/notificationsApi';

import type { NotificationRead } from '@prezio/shared-types';

export function useNotificationsQuery(unreadOnly = false) {
  return useQuery<NotificationRead[], Error>({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => listNotifications(unreadOnly),
  });
}
