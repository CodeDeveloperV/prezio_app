import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconAlertTriangle,
  IconClock,
  IconRefresh,
  IconWifiOff,
} from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { useSyncStatus, type SyncStatus } from '../../features/shopping-lists/hooks/useSyncStatus';
import { runSync } from '../../features/shopping-lists/services/offline/shoppingListSyncEngine';

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 50,
  },
});

const PRESENTATION: Record<
  Exclude<SyncStatus, 'synced'>,
  { label: (info: { pendingCount: number; errorCount: number }) => string; color: string; Icon: typeof IconWifiOff }
> = {
  offline: { label: () => 'Sin conexión', color: colorTokens.textSecondary, Icon: IconWifiOff },
  pending: {
    label: ({ pendingCount }) => `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} por sincronizar`,
    color: colorTokens.warning,
    Icon: IconClock,
  },
  syncing: { label: () => 'Sincronizando…', color: colorTokens.primary, Icon: IconRefresh },
  error: {
    label: ({ errorCount }) => `Error al sincronizar ${errorCount} cambio${errorCount === 1 ? '' : 's'}`,
    color: colorTokens.danger,
    Icon: IconAlertTriangle,
  },
};

/**
 * Consolidated, app-wide sync indicator (Epic 14 Task 9). Mounted once so a single banner
 * reflects the whole PendingAction queue instead of a toast per action -- see useSyncStatus.
 * Renders nothing once everything is synced and online.
 */
export function SyncStatusBanner() {
  const insets = useSafeAreaInsets();
  const { status, pendingCount, errorCount } = useSyncStatus();

  if (status === 'synced') {
    return null;
  }

  const { label, color, Icon } = PRESENTATION[status];

  return (
    <XStack
      style={[styles.banner, { paddingTop: insets.top }]}
      backgroundColor="$background"
      borderBottomWidth={1}
      borderBottomColor="$border"
      paddingHorizontal="$4"
      paddingVertical="$2"
      alignItems="center"
      gap="$2"
    >
      <Icon color={color} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
      <Text flex={1} fontFamily="$body" fontSize="$xs" color={color}>
        {label({ pendingCount, errorCount })}
      </Text>
      {status === 'error' && (
        <Text
          fontFamily="$heading"
          fontSize="$xs"
          color={colorTokens.primary}
          onPress={() => runSync().catch(() => undefined)}
        >
          Reintentar
        </Text>
      )}
    </XStack>
  );
}
