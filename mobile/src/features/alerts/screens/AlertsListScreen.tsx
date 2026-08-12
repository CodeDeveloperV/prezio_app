import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { Button, Input, Switch, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconEdit, IconTrash } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useDeleteAlertMutation, useUpdateAlertMutation } from '../hooks/useAlertMutations';
import { useAlertsQuery } from '../hooks/useAlertsQuery';

import type { PriceAlertRead } from '@prezio/shared-types';

const styles = StyleSheet.create({
  listContent: {
    gap: 12,
    padding: 16,
  },
});

function scopeLabel(alert: PriceAlertRead): string {
  if (alert.store_branch_id) {
    return 'Esta sucursal';
  }
  if (alert.store_id) {
    return 'Esta cadena';
  }
  return 'Cualquier tienda';
}

function AlertCard({ alert }: { alert: PriceAlertRead }) {
  const [editing, setEditing] = useState(false);
  const [targetPriceInput, setTargetPriceInput] = useState(alert.target_price);
  const updateAlertMutation = useUpdateAlertMutation();
  const deleteAlertMutation = useDeleteAlertMutation();

  const handleSaveTargetPrice = () => {
    const parsedPrice = Number(targetPriceInput);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return;
    }
    updateAlertMutation.mutate(
      { alertId: alert.id, request: { target_price: parsedPrice } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleToggleActive = (active: boolean) => {
    updateAlertMutation.mutate({ alertId: alert.id, request: { active } });
  };

  return (
    <YStack backgroundColor="$surface" borderRadius="$3" padding="$4" gap="$2">
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack flex={1} gap="$1">
          <Text fontFamily="$heading" fontSize="$md" color="$color">
            {alert.product_name}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            {scopeLabel(alert)}
          </Text>
          {alert.is_below_threshold && (
            <Text fontFamily="$body" fontSize="$xs" color="$primary">
              ¡Ya está por debajo de tu meta!
            </Text>
          )}
        </YStack>
        <Switch checked={alert.active} onCheckedChange={handleToggleActive}>
          <Switch.Thumb />
        </Switch>
      </XStack>

      {editing ? (
        <XStack gap="$2" alignItems="center">
          <Input
            flex={1}
            keyboardType="decimal-pad"
            value={targetPriceInput}
            onChangeText={setTargetPriceInput}
          />
          <Button size="$3" backgroundColor="$primary" color="$white" onPress={handleSaveTargetPrice}>
            Guardar
          </Button>
        </XStack>
      ) : (
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Meta: ${alert.target_price}
          </Text>
          <XStack gap="$3">
            <Button size="$2" circular chromeless onPress={() => setEditing(true)}>
              <IconEdit color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Button>
            <Button size="$2" circular chromeless onPress={() => deleteAlertMutation.mutate(alert.id)}>
              <IconTrash color={colorTokens.danger} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Button>
          </XStack>
        </XStack>
      )}
    </YStack>
  );
}

export function AlertsListScreen() {
  const alertsQuery = useAlertsQuery();
  const alerts = alertsQuery.data ?? [];

  if (alertsQuery.isLoading) {
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
        data={alerts}
        keyExtractor={(alert) => String(alert.id)}
        contentContainerStyle={styles.listContent}
        onRefresh={() => alertsQuery.refetch()}
        refreshing={alertsQuery.isRefetching}
        renderItem={({ item }) => <AlertCard alert={item} />}
        ListEmptyComponent={
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Todavía no tienes alertas de precio. Crea una desde el detalle de un producto.
          </Text>
        }
      />
    </ScreenContainer>
  );
}
