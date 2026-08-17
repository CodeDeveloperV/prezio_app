import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconBuildingStore,
  IconChevronRight,
  IconMapPin,
  IconScan,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useStoreBranchesQuery, useStoresQuery } from '../../stores/hooks/useStores';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';
import { addShoppingListItem, createShoppingList, setShoppingListActiveBranch } from '../../shopping-lists/api/shoppingListsApi';

import type { Store, StoreBranch } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'BranchSelect'>;

const primaryPressStyle = { backgroundColor: '$primaryPress' };

/** First step of the scan flow: pick a store, then a branch, before the camera opens --
 * quick scan can skip this, but the contextual/new-purchase flow still uses it. */
export function BranchSelectScreen({ route, navigation }: Props) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const storesQuery = useStoresQuery();
  const branchesQuery = useStoreBranchesQuery(selectedStore?.id);
  const queryClient = useQueryClient();
  const stores = (storesQuery.data ?? []) as Store[];
  const selectedStoreId = selectedStore?.id ?? null;
  const pendingScan = route.params?.pendingScan;
  const canStartPurchase = selectedStore !== null && selectedBranchId !== null && !isSubmitting;
  const isLoadingStores = storesQuery.isPending && stores.length === 0;
  const isLoadingBranches = selectedStore !== null && branchesQuery.isPending;

  const handleStartPurchase = async () => {
    const branchId = selectedBranchId;
    if (branchId == null) {
      return;
    }

    setIsSubmitting(true);
    try {
      const shoppingList = await createShoppingList({ name: 'Compra de hoy' });
      await setShoppingListActiveBranch(shoppingList.id, { store_branch_id: branchId });

      if (pendingScan) {
        await addShoppingListItem(shoppingList.id, {
          product_id: pendingScan.product.id,
          quantity: 1,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
      navigation.replace('Scan', { storeBranchId: branchId, scanFlow: 'purchase' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <FlowHeader
        title="Nueva compra"
        subtitle={
          pendingScan
            ? 'Elige tienda y sucursal para arrancar la compra con el producto ya leído.'
            : 'Elige supermercado y sucursal antes de empezar a escanear.'
        }
        onBack={() => navigation.goBack()}
      />

      <YStack gap="$4">
        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
          <XStack alignItems="flex-start" gap="$3">
            <YStack
              width={52}
              height={52}
              borderRadius="$full"
              backgroundColor="$primary"
              alignItems="center"
              justifyContent="center"
            >
              <IconScan color={colorTokens.white} size={26} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </YStack>

            <YStack flex={1} gap="$2">
              <Text fontFamily="$heading" fontSize="$xl" color="$color">
                ¿En qué súper vas a comprar hoy?
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Elige la tienda y la sucursal antes de empezar a escanear.
              </Text>
            </YStack>
          </XStack>
        </Card>

        {!selectedStore && (
          <YStack gap="$3">
            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Tiendas disponibles
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Selecciona una tienda para ver sus sucursales.
              </Text>
            </YStack>

            {isLoadingStores && (
              <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
                <XStack alignItems="center" gap="$3">
                  <ActivityIndicator color={colorTokens.primary} />
                  <YStack flex={1} gap="$0.5">
                    <Text fontFamily="$heading" fontSize="$sm" color="$color">
                      Preparando tiendas
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                      Estamos cargando las opciones disponibles para que puedas continuar.
                    </Text>
                  </YStack>
                </XStack>
              </Card>
            )}

            {storesQuery.isError && (
              <Card backgroundColor="$surface" borderRadius="$4" padding="$4">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  No pudimos cargar las tiendas.
                </Text>
              </Card>
            )}

            {!isLoadingStores &&
              stores.map((store) => {
                const isSelectedStore = selectedStoreId !== null && selectedStoreId === store.id;
                return (
                  <Button
                    key={store.id}
                    justifyContent="space-between"
                    alignItems="center"
                    backgroundColor="$surface"
                    borderWidth={1}
                    borderColor={isSelectedStore ? '$primary' : '$borderColor'}
                    borderRadius="$4"
                    padding="$4"
                    minHeight={68}
                    onPress={() => {
                      setSelectedStore(store);
                      setSelectedBranchId(null);
                    }}
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
                        <IconMapPin
                          color={colorTokens.textSecondary}
                          size={18}
                          strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                        />
                      </YStack>
                      <YStack flex={1} gap="$0.5">
                        <Text fontFamily="$heading" fontSize="$md" color="$color" textAlign="left">
                          {store.name}
                        </Text>
                        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left">
                          Elige una sucursal para continuar
                        </Text>
                      </YStack>
                    </XStack>
                    <IconChevronRight
                      color={colorTokens.textSecondary}
                      size={18}
                      strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                    />
                  </Button>
                );
              })}
          </YStack>
        )}

        {selectedStore && (
          <YStack gap="$3">
            <Button
              elevation={1}
              backgroundColor="$surface"
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$4"
              padding="$4"
              minHeight={88}
              justifyContent="space-between"
              alignItems="center"
              onPress={() => {
                setSelectedStore(null);
                setSelectedBranchId(null);
              }}
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
                  <IconBuildingStore
                    color={colorTokens.primary}
                    size={18}
                    strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                  />
                </YStack>
                <YStack flex={1} gap="$0.5">
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left">
                    Tienda elegida
                  </Text>
                  <Text fontFamily="$heading" fontSize="$md" color="$color" textAlign="left" numberOfLines={2}>
                    {selectedStore.name}
                  </Text>
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left">
                    Toca para cambiarla
                  </Text>
                </YStack>
              </XStack>
              <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Button>

            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Sucursales de {selectedStore.name}
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Elige la sucursal donde vas a comparar precios.
              </Text>
            </YStack>

            {isLoadingBranches && (
              <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
                <XStack alignItems="center" gap="$3">
                  <ActivityIndicator color={colorTokens.primary} />
                  <YStack flex={1} gap="$0.5">
                    <Text fontFamily="$heading" fontSize="$sm" color="$color">
                      Preparando sucursales
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                      Estamos trayendo las sucursales de {selectedStore.name}.
                    </Text>
                  </YStack>
                </XStack>
              </Card>
            )}

            {branchesQuery.isError && (
              <Card backgroundColor="$surface" borderRadius="$4" padding="$4">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  No pudimos cargar las sucursales.
                </Text>
              </Card>
            )}

            {!isLoadingBranches &&
              branchesQuery.data?.map((item: StoreBranch) => (
                <Button
                  key={item.id}
                  justifyContent="space-between"
                  alignItems="center"
                  backgroundColor="$surface"
                  borderWidth={1}
                  borderColor={selectedBranchId === item.id ? '$primary' : '$borderColor'}
                  borderRadius="$4"
                  paddingHorizontal="$4"
                  paddingVertical="$4"
                  minHeight={80}
                  onPress={() => {
                    setSelectedBranchId(item.id);
                  }}
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
                      <IconBuildingStore
                        color={colorTokens.primary}
                        size={18}
                        strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                      />
                    </YStack>
                    <YStack flex={1} gap="$0.25" flexShrink={1}>
                      <Text
                        fontFamily="$heading"
                        fontSize="$md"
                        color="$color"
                        textAlign="left"
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left" numberOfLines={2}>
                        {item.city}
                      </Text>
                    </YStack>
                  </XStack>
                  <IconChevronRight
                    color={colorTokens.textSecondary}
                    size={18}
                    strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                  />
                </Button>
              ))}
          </YStack>
        )}

        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <Text fontFamily="$heading" fontSize="$sm" color="$color">
            Empezar compra
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            La sucursal elegida define el contexto del escaneo.
          </Text>

          <Button
            backgroundColor="$primary"
            color="$white"
            pressStyle={primaryPressStyle}
            borderRadius="$4"
            paddingVertical="$4"
            minHeight={56}
            opacity={canStartPurchase ? 1 : 0.7}
            disabled={!canStartPurchase}
            onPress={() => handleStartPurchase().catch(() => undefined)}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colorTokens.white} />
            ) : (
              <Text fontFamily="$heading" fontSize="$md" color="$white">
                Escanear
              </Text>
            )}
          </Button>
        </Card>
      </YStack>
    </ScreenContainer>
  );
}
