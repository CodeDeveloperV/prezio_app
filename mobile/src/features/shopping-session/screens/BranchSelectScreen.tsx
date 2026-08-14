import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

import type { Store, StoreBranch } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'BranchSelect'>;

function StepChip({ children }: { children: string }) {
  return (
    <YStack backgroundColor="rgba(34, 197, 94, 0.08)" borderRadius="$full" paddingHorizontal="$3" paddingVertical="$1.5">
      <Text fontFamily="$body" fontSize="$xs" color="$primary">
        {children}
      </Text>
    </YStack>
  );
}

/** First step of the scan flow: pick a store, then a branch, before the camera opens --
 * every scan needs a store_branch_id to look up the right StoreProduct/price. */
export function BranchSelectScreen({ navigation }: Props) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const storesQuery = useStoresQuery();
  const branchesQuery = useStoreBranchesQuery(selectedStore?.id);
  const stores = (storesQuery.data ?? []) as Store[];
  const selectedStoreId = selectedStore ? (selectedStore as { id: number }).id : null;

  return (
    <ScreenContainer>
      <FlowHeader
        title="Escanear producto"
        subtitle="Elegí tienda y sucursal para abrir la cámara con el contexto correcto."
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
                Escaneá un producto
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Vamos a validar el precio en la sucursal correcta antes de mostrarte el resultado.
              </Text>
            </YStack>
          </XStack>

          <XStack flexWrap="wrap" gap="$2">
            <StepChip>Tienda</StepChip>
            <StepChip>Sucursal</StepChip>
            <StepChip>Escáner</StepChip>
            <StepChip>Precio</StepChip>
          </XStack>
        </Card>

        {!selectedStore && (
          <YStack gap="$3">
            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Tiendas disponibles
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Seleccioná una tienda para ver sus sucursales.
              </Text>
            </YStack>

            {storesQuery.isPending && (
              <ActivityIndicator color={colorTokens.primary} />
            )}

            {storesQuery.isError && (
              <Card backgroundColor="$surface" borderRadius="$4" padding="$4">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  No pudimos cargar las tiendas.
                </Text>
              </Card>
            )}

            {stores.map((item: any) => {
              const store = item as { id: number; name: string; country: string };
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
                        Elegí una sucursal para continuar
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
            <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <YStack flex={1} gap="$0.5">
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                    Tienda elegida
                  </Text>
                  <Text fontFamily="$heading" fontSize="$md" color="$color">
                    {selectedStore.name}
                  </Text>
                </YStack>
                <Button chromeless size="$2" onPress={() => setSelectedStore(null)}>
                  Cambiar tienda
                </Button>
              </XStack>
            </Card>

            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Sucursales de {selectedStore.name}
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Elegí la sucursal donde vas a comparar precios.
              </Text>
            </YStack>

            {branchesQuery.isPending && <ActivityIndicator color={colorTokens.primary} />}

            {branchesQuery.isError && (
              <Card backgroundColor="$surface" borderRadius="$4" padding="$4">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  No pudimos cargar las sucursales.
                </Text>
              </Card>
            )}

            {branchesQuery.data?.map((item: StoreBranch) => (
              <Button
                key={item.id}
                justifyContent="space-between"
                alignItems="center"
                backgroundColor="$surface"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
                padding="$4"
                minHeight={68}
                onPress={() => navigation.navigate('Scan', { storeBranchId: item.id })}
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
                    <Text fontFamily="$heading" fontSize="$md" color="$color" textAlign="left">
                      {item.name}
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left">
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

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
          <Text fontFamily="$heading" fontSize="$sm" color="$color">
            Escanear con contexto correcto
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            La sucursal seleccionada define el precio que vas a ver después del escaneo.
          </Text>
        </Card>
      </YStack>
    </ScreenContainer>
  );
}
