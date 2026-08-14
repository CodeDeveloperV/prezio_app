import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconBellRinging,
  IconCheck,
  IconClock,
  IconFlag,
  IconHistory,
  IconPlus,
  IconScale,
  IconShoppingCart,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useReportIncorrectBarcodeMutation } from '../../catalog/hooks/useCatalogMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';
import { addShoppingListItem, createShoppingList } from '../../shopping-lists/api/shoppingListsApi';
import { selectActiveShoppingList } from '../../shopping-lists/utils/selectActiveShoppingList';
import { useShoppingListsQuery } from '../../shopping-lists/hooks/useShoppingLists';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ScanResult'>;
const styles = StyleSheet.create({
  productImage: {
    width: 136,
    height: 136,
    borderRadius: 16,
  },
});

function formatDate(iso: string | null): string {
  if (!iso) {
    return 'Sin verificar';
  }
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPrice(price: string | number): string {
  const numeric = Number(price);
  if (Number.isNaN(numeric)) {
    return String(price);
  }
  return numeric.toLocaleString('es-PA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ScanResultScreen({ route, navigation }: Props) {
  const { storeBranchId, barcodeId, product, storeProduct, fromCache = false, fromSearch = false } = route.params;
  const [addedToActiveList, setAddedToActiveList] = useState(false);
  const [createdNewPurchase, setCreatedNewPurchase] = useState(false);

  const shoppingListsQuery = useShoppingListsQuery();
  const activeShoppingList = selectActiveShoppingList(shoppingListsQuery.data);
  const queryClient = useQueryClient();
  const reportBarcodeMutation = useReportIncorrectBarcodeMutation();

  const addToActiveListMutation = useMutation({
    mutationFn: async () => {
      if (!activeShoppingList) {
        throw new Error('No active shopping list');
      }
      return addShoppingListItem(activeShoppingList.id, {
        product_id: product.id,
        quantity: 1,
      });
    },
    onSuccess: () => {
      setAddedToActiveList(true);
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
    },
  });

  const createNewPurchaseMutation = useMutation({
    mutationFn: async () => {
      const shoppingList = await createShoppingList({ name: 'Compra de hoy' });
      return addShoppingListItem(shoppingList.id, {
        product_id: product.id,
        quantity: 1,
      });
    },
    onSuccess: () => {
      setCreatedNewPurchase(true);
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
    },
  });

  const handleReportIncorrect = () => {
    if (barcodeId == null) {
      return;
    }
    reportBarcodeMutation.mutate(barcodeId, {
      onSuccess: () => navigation.replace('Scan', storeBranchId == null ? undefined : { storeBranchId }),
    });
  };

  const handleViewHistory = () => {
    if (!storeProduct) {
      return;
    }
    navigation.navigate('PriceHistory', { storeProductId: storeProduct.id });
  };

  const handleCreateAlert = () => {
    navigation.navigate('CreateAlert', {
      productId: product.id,
      productName: product.canonical_name,
      storeBranchId: storeProduct?.store_branch_id ?? null,
    });
  };

  const handleCompare = () => {
    navigation.getParent()?.navigate('Comparator' as never);
  };

  const handleAddToActiveList = async () => {
    if (!activeShoppingList) {
      return;
    }
    await addToActiveListMutation.mutateAsync();
  };

  const handleCreateNewPurchase = async () => {
    await createNewPurchaseMutation.mutateAsync();
  };

  return (
    <ScreenContainer>
      <FlowHeader
        title="Producto encontrado"
        subtitle={product.canonical_name}
        onBack={() => navigation.goBack()}
      />

      <YStack gap="$4">
        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$4">
          <XStack alignItems="center" gap="$3">
            {product.image_url ? (
              <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="contain" />
            ) : (
              <YStack
                width={136}
                height={136}
                borderRadius={16}
                backgroundColor="rgba(15, 23, 42, 0.06)"
                alignItems="center"
                justifyContent="center"
              >
                <IconShoppingCart color={colorTokens.textSecondary} size={34} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </YStack>
            )}

            <YStack flex={1} gap="$1">
              {product.brand_name && (
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  {product.brand_name}
                </Text>
              )}
              <Text fontFamily="$heading" fontSize="$lg" color="$color">
                {product.canonical_name}
              </Text>
              {product.presentation && (
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  {product.presentation}
                </Text>
              )}

              <XStack alignItems="center" gap="$2" flexWrap="wrap" marginTop="$1">
                <YStack backgroundColor="rgba(34, 197, 94, 0.10)" borderRadius="$full" paddingHorizontal="$3" paddingVertical="$1.5">
                  <Text fontFamily="$body" fontSize="$xs" color="$primary">
                    {fromSearch ? 'Búsqueda manual' : 'Código validado'}
                  </Text>
                </YStack>
                {fromCache && (
                  <YStack backgroundColor="rgba(239, 68, 68, 0.10)" borderRadius="$full" paddingHorizontal="$3" paddingVertical="$1.5">
                    <Text fontFamily="$body" fontSize="$xs" color="$danger">
                      Sin conexión
                    </Text>
                  </YStack>
                )}
              </XStack>
            </YStack>
          </XStack>
        </Card>

        <Card elevation={3} backgroundColor={colorTokens.textPrimary} borderRadius="$4" padding="$5" gap="$4">
          <XStack alignItems="flex-start" gap="$3">
            <YStack
              width={48}
              height={48}
              borderRadius="$full"
              backgroundColor="rgba(34, 197, 94, 0.14)"
              alignItems="center"
              justifyContent="center"
            >
              <IconCheck color={colorTokens.primary} size={24} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </YStack>

            <YStack flex={1} gap="$1">
              <Text fontFamily="$body" fontSize="$xs" letterSpacing={1.2} color="$primary">
                Precio encontrado
              </Text>
              <Text fontFamily="$heading" fontSize="$xl" color="$white">
                {product.canonical_name}
              </Text>
            </YStack>
          </XStack>

          {storeProduct ? (
            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$display" color="$primary">
                ${formatPrice(storeProduct.current_price)}
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="#CBD5E1">
                Precio en esta sucursal · actualizado {formatDate(storeProduct.last_verified_at)}
              </Text>
            </YStack>
          ) : (
            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$xl" color="$white">
                Sin precio registrado
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="#CBD5E1">
                Todavía no tenemos un valor confirmado en esta sucursal.
              </Text>
            </YStack>
          )}

          {fromCache && (
            <XStack alignItems="center" gap="$2" backgroundColor="rgba(255, 255, 255, 0.06)" borderRadius="$3" padding="$3">
              <IconClock color={colorTokens.primary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$body" fontSize="$xs" color="#E2E8F0" flex={1}>
                Sin conexión · precio guardado en caché, puede no ser el actual
              </Text>
            </XStack>
          )}
        </Card>

        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <YStack gap="$1">
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Guardar o comparar
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Elegí si querés agregar este producto a una compra existente o crear una nueva.
            </Text>
          </YStack>

          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            {activeShoppingList ? (
              <YStack flex={1} minWidth={180}>
                <Button
                  backgroundColor="$primary"
                  color="$white"
                  icon={
                    addedToActiveList ? (
                      <IconCheck color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                    ) : (
                      <IconShoppingCart color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                    )
                  }
                  disabled={addToActiveListMutation.isPending || addedToActiveList || createdNewPurchase}
                  onPress={handleAddToActiveList}
                >
                  {addedToActiveList ? 'Agregado a compra' : `Agregar a ${activeShoppingList.name}`}
                </Button>
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" marginTop="$1">
                  Compra activa: {activeShoppingList.name}
                </Text>
              </YStack>
            ) : (
              <YStack flex={1} minWidth={180}>
                <Button backgroundColor="$surface" disabled>
                  No hay compra activa
                </Button>
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" marginTop="$1">
                  Creá una nueva compra para usar este atajo.
                </Text>
              </YStack>
            )}

            <YStack flex={1} minWidth={180}>
              <Button
                backgroundColor="$surface"
                icon={<IconPlus color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                disabled={createNewPurchaseMutation.isPending || createdNewPurchase}
                onPress={handleCreateNewPurchase}
              >
                {createdNewPurchase ? 'Nueva compra creada' : 'Agregar a nueva compra'}
              </Button>
            </YStack>
          </XStack>

          <XStack gap="$2" flexWrap="wrap">
            <Button
              flex={1}
              minWidth={150}
              backgroundColor="$surface"
              icon={<IconScale color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
              onPress={handleCompare}
            >
              Comparar precios
            </Button>
            <Button
              flex={1}
              minWidth={150}
              backgroundColor="$surface"
              icon={<IconBellRinging color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
              onPress={handleCreateAlert}
            >
              Crear alerta
            </Button>
          </XStack>

          <XStack gap="$2" flexWrap="wrap">
            <Button
              flex={1}
              minWidth={150}
              backgroundColor="$surface"
              icon={<IconHistory color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
              onPress={handleViewHistory}
              disabled={!storeProduct || fromCache}
            >
              Ver historial
            </Button>
            <Button
              flex={1}
              minWidth={150}
              backgroundColor="$surface"
              icon={<IconFlag color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
              onPress={handleReportIncorrect}
              disabled={fromCache || barcodeId == null}
            >
              Producto incorrecto
            </Button>
          </XStack>
        </Card>

        <Button
          unstyled
          onPress={() => navigation.replace('Scan', storeBranchId == null ? undefined : { storeBranchId })}
        >
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Escanear otro producto
          </Text>
        </Button>
      </YStack>
    </ScreenContainer>
  );
}
