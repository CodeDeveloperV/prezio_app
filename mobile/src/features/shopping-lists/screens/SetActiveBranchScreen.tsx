import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconBuildingStore, IconChevronRight, IconMapPin } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useStoreBranchesQuery, useStoresQuery } from '../../stores/hooks/useStores';
import type { ProfileStackParamList } from '../../../app/navigation/types';
import { useSetActiveBranchMutation } from '../hooks/useShoppingListMutations';

import type { Store, StoreBranch } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'SetActiveBranch'>;

/**
 * Two-step store -> branch picker for a list's active branch (Epic 13). This is the only place a
 * user chooses a branch for a list -- there is no per-item store selection. Every item checked
 * afterwards snapshots this branch's real price at check time (see ShoppingListService.update_item);
 * changing the active branch later never rewrites already-checked items.
 */
export function SetActiveBranchScreen({ route, navigation }: Props) {
  const { shoppingListId, shoppingListLocalId } = route.params;
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const storesQuery = useStoresQuery();
  const branchesQuery = useStoreBranchesQuery(selectedStore?.id);
  const stores = (storesQuery.data ?? []) as Store[];
  const setActiveBranchMutation = useSetActiveBranchMutation(shoppingListId, shoppingListLocalId);

  const handleSelectBranch = async (branch: StoreBranch) => {
    await setActiveBranchMutation.mutateAsync(branch.id);
    navigation.goBack();
  };

  return (
    <ScreenContainer>
      <YStack gap="$4">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$lg" color="$color">
            Elegí la sucursal
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            El precio de cada producto que marques como comprado se guardará según la sucursal que
            elijas acá.
          </Text>
        </YStack>

        {!selectedStore && (
          <YStack gap="$3">
            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Tiendas disponibles
            </Text>

            {storesQuery.isPending && <ActivityIndicator color={colorTokens.primary} />}

            {storesQuery.isError && (
              <Card backgroundColor="$surface" borderRadius="$4" padding="$4">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  No pudimos cargar las tiendas.
                </Text>
              </Card>
            )}

            {stores.map((store) => (
              <Button
                key={store.id}
                justifyContent="space-between"
                alignItems="center"
                backgroundColor="$surface"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
                padding="$4"
                minHeight={68}
                onPress={() => setSelectedStore(store)}
              >
                <XStack alignItems="center" gap="$3" flex={1}>
                  <YStack
                    width={42}
                    height={42}
                    borderRadius="$full"
                    backgroundColor="rgba(15, 23, 42, 0.05)"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <IconMapPin color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </YStack>
                  <Text fontFamily="$heading" fontSize="$md" color="$color" textAlign="left">
                    {store.name}
                  </Text>
                </XStack>
                <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </Button>
            ))}
          </YStack>
        )}

        {selectedStore && (
          <YStack gap="$3">
            <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <Text fontFamily="$heading" fontSize="$md" color="$color">
                  {selectedStore.name}
                </Text>
                <Button chromeless size="$2" onPress={() => setSelectedStore(null)}>
                  Cambiar tienda
                </Button>
              </XStack>
            </Card>

            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Sucursales de {selectedStore.name}
            </Text>

            {branchesQuery.isPending && <ActivityIndicator color={colorTokens.primary} />}

            {branchesQuery.isError && (
              <Card backgroundColor="$surface" borderRadius="$4" padding="$4">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  No pudimos cargar las sucursales.
                </Text>
              </Card>
            )}

            {branchesQuery.data?.map((branch: StoreBranch) => (
              <Button
                key={branch.id}
                justifyContent="space-between"
                alignItems="center"
                backgroundColor="$surface"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
                padding="$4"
                minHeight={68}
                disabled={setActiveBranchMutation.isPending}
                onPress={() => handleSelectBranch(branch)}
              >
                <XStack alignItems="center" gap="$3" flex={1}>
                  <YStack
                    width={42}
                    height={42}
                    borderRadius="$full"
                    backgroundColor="rgba(34, 197, 94, 0.08)"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <IconBuildingStore color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </YStack>
                  <YStack flex={1} gap="$0.5">
                    <Text fontFamily="$heading" fontSize="$md" color="$color" textAlign="left">
                      {branch.name}
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left">
                      {branch.city}
                    </Text>
                  </YStack>
                </XStack>
                <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </Button>
            ))}
          </YStack>
        )}

        {setActiveBranchMutation.isError && (
          <Text fontFamily="$body" fontSize="$sm" color="$danger">
            No pudimos guardar la sucursal. Intenta de nuevo.
          </Text>
        )}
      </YStack>
    </ScreenContainer>
  );
}
