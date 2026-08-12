import { ActivityIndicator, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { usePriceHistoryQuery } from '../../pricing/hooks/usePricingMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

import type { PriceHistoryRead } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'PriceHistory'>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function PriceHistoryScreen({ route }: Props) {
  const { storeProductId } = route.params;
  const historyQuery = usePriceHistoryQuery(storeProductId);

  return (
    <ScreenContainer scroll={false}>
      {historyQuery.isPending && <ActivityIndicator color="#22C55E" />}
      {historyQuery.isError && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          No pudimos cargar el historial de precios.
        </Text>
      )}
      {historyQuery.data?.length === 0 && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Todavía no hay cambios de precio registrados.
        </Text>
      )}

      <FlatList
        data={historyQuery.data ?? []}
        keyExtractor={(entry) => String(entry.id)}
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
