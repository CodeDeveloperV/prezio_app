import { httpClient } from '../../../shared/services/api/httpClient';

import type { MarkAllReadResponse, NotificationRead } from '@prezio/shared-types';

export function listNotifications(unreadOnly = false): Promise<NotificationRead[]> {
  return httpClient
    .get('notifications', { searchParams: unreadOnly ? { unread_only: 'true' } : undefined })
    .json<NotificationRead[]>();
}

export function markNotificationRead(notificationId: number): Promise<NotificationRead> {
  return httpClient.patch(`notifications/${notificationId}/read`).json<NotificationRead>();
}

export function markAllNotificationsRead(): Promise<MarkAllReadResponse> {
  return httpClient.patch('notifications/read-all').json<MarkAllReadResponse>();
}
