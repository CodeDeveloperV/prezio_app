import { useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { IconBuildingStore, IconChevronRight, IconShoppingCart } from '../../../app/theme/icons';
import { useStoreBranchesQuery, useStoresQuery } from '../../stores/hooks/useStores';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

import type { Store, StoreBranch } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'BranchSelect'>;

/** First step of the scan flow: pick a store, then a branch, before the camera opens --
 * every scan needs a store_branch_id to look up the right StoreProduct/price. */
export function BranchSelectScreen({ navigation }: Props) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const storesQuery = useStoresQuery();
  const branchesQuery = useStoreBranchesQuery(selectedStore?.id);

  if (!selectedStore) {
    return (
      <ScreenContainer scroll={false}>
        <YStack gap="$2">
          <IconShoppingCart color="#22C55E" size={32} strokeWidth={1.5} />
          <Text fontFamily="$heading" fontSize="$lg" color="$color">
            ¿En qué tienda vas a comprar?
          </Text>
        </YStack>

        {storesQuery.isPending && <ActivityIndicator color="#22C55E" />}
        {storesQuery.isError && (
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            No pudimos cargar las tiendas.
          </Text>
        )}

        <FlatList
          data={storesQuery.data ?? []}
          keyExtractor={(store) => String(store.id)}
          renderItem={({ item }) => (
            <XStack
              alignItems="center"
              justifyContent="space-between"
              backgroundColor="$surface"
              borderRadius="$3"
              padding="$3"
              marginBottom="$2"
              onPress={() => setSelectedStore(item)}
            >
              <XStack alignItems="center" gap="$3">
                <IconBuildingStore color="#64748B" size={20} strokeWidth={1.75} />
                <Text fontFamily="$body" fontSize="$md" color="$color">
                  {item.name}
                </Text>
              </XStack>
              <IconChevronRight color="#64748B" size={18} strokeWidth={1.75} />
            </XStack>
          )}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <YStack gap="$2">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          {selectedStore.name}
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" onPress={() => setSelectedStore(null)}>
          Cambiar tienda
        </Text>
      </YStack>

      {branchesQuery.isPending && <ActivityIndicator color="#22C55E" />}
      {branchesQuery.isError && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          No pudimos cargar las sucursales.
        </Text>
      )}

      <FlatList
        data={branchesQuery.data ?? []}
        keyExtractor={(branch) => String(branch.id)}
        renderItem={({ item }: { item: StoreBranch }) => (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            marginBottom="$2"
            onPress={() => navigation.navigate('Scan', { storeBranchId: item.id })}
          >
            <YStack>
              <Text fontFamily="$body" fontSize="$md" color="$color">
                {item.name}
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                {item.city}
              </Text>
            </YStack>
            <IconChevronRight color="#64748B" size={18} strokeWidth={1.75} />
          </XStack>
        )}
      />
    </ScreenContainer>
  );
}
