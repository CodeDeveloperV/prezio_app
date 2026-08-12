import { ActivityIndicator, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { colorTokens } from '../../../app/theme/tokens';
import { usePriceHistoryQuery } from '../../pricing/hooks/usePricingMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

import type { PriceHistoryRead, PriceHistoryUpdatedByRead } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'PriceHistory'>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit' });
}

function getUpdatedByLabel(updatedBy: PriceHistoryUpdatedByRead | null): string {
  if (updatedBy === null) {
    return 'Usuario desconocido';
  }
  return updatedBy.display_name ?? updatedBy.email;
}

export function PriceHistoryScreen({ route }: Props) {
  const { storeProductId } = route.params;
  const historyQuery = usePriceHistoryQuery(storeProductId);
  const history = historyQuery.data ?? [];

  // history arrives newest-first; the chart reads left-to-right chronologically.
  const chartPoints = [...history]
    .reverse()
    .map((entry) => ({ x: new Date(entry.updated_at).getTime(), y: Number(entry.new_price) }));

  return (
    <ScreenContainer scroll={false}>
      {historyQuery.isPending && <ActivityIndicator color={colorTokens.primary} />}
      {historyQuery.isError && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          No pudimos cargar el historial de precios.
        </Text>
      )}
      {historyQuery.isSuccess && history.length === 0 && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Todavía no hay cambios de precio registrados.
        </Text>
      )}

      <FlatList
        data={history}
        keyExtractor={(entry) => String(entry.id)}
        ListHeaderComponent={
          historyQuery.isSuccess && history.length > 0 ? (
            <LineChart
              points={chartPoints}
              formatXLabel={formatShortDate}
              formatYLabel={(price) => `$${price.toFixed(2)}`}
            />
          ) : null
        }
        renderItem={({ item }: { item: PriceHistoryRead }) => (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            marginBottom="$2"
          >
            <YStack>
              <Text fontFamily="$body" fontSize="$md" color="$color">
                ${item.new_price}
              </Text>
              {item.previous_price !== null && (
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  Antes: ${item.previous_price}
                </Text>
              )}
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                {getUpdatedByLabel(item.updated_by)}
              </Text>
            </YStack>
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              {formatDate(item.updated_at)}
            </Text>
          </XStack>
        )}
      />
    </ScreenContainer>
  );
}
