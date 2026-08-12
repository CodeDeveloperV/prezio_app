import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation } from '../hooks/useNotificationMutations';
import { useNotificationsQuery } from '../hooks/useNotificationsQuery';
import { colorTokens } from '../../../app/theme/tokens';

import type { NotificationRead } from '@prezio/shared-types';

const styles = StyleSheet.create({
  listContent: {
    gap: 12,
    padding: 16,
  },
});
const rowPressStyle = { opacity: 0.7 };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
}

function NotificationCard({ notification }: { notification: NotificationRead }) {
  const markReadMutation = useMarkNotificationReadMutation();
  const isUnread = notification.read_at === null;

  return (
    <YStack
      backgroundColor={isUnread ? '$surface' : '$background'}
      borderRadius="$3"
      padding="$4"
      gap="$1"
      pressStyle={isUnread ? rowPressStyle : undefined}
      onPress={isUnread ? () => markReadMutation.mutate(notification.id) : undefined}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontFamily="$heading" fontSize="$sm" color="$color">
          {notification.title}
        </Text>
        {isUnread && <YStack width={8} height={8} borderRadius="$full" backgroundColor="$primary" />}
      </XStack>
      <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
        {notification.message}
      </Text>
      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
        {formatDate(notification.created_at)}
      </Text>
    </YStack>
  );
}

export function NotificationsScreen() {
  const notificationsQuery = useNotificationsQuery();
  const notifications = notificationsQuery.data ?? [];
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  if (notificationsQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator color={colorTokens.primary} />
        </YStack>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <FlatList
        data={notifications}
        keyExtractor={(notification) => String(notification.id)}
        contentContainerStyle={styles.listContent}
        onRefresh={() => notificationsQuery.refetch()}
        refreshing={notificationsQuery.isRefetching}
        ListHeaderComponent={
          notifications.some((n) => n.read_at === null) ? (
            <Button
              alignSelf="flex-end"
              size="$2"
              chromeless
              onPress={() => markAllReadMutation.mutate()}
            >
              <Text fontFamily="$body" fontSize="$xs" color="$primary">
                Marcar todo como leído
              </Text>
            </Button>
          ) : null
        }
        renderItem={({ item }) => <NotificationCard notification={item} />}
        ListEmptyComponent={
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            No tienes notificaciones todavía.
          </Text>
        }
      />
    </ScreenContainer>
  );
}
