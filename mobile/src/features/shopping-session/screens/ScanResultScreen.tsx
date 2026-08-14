import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconAlertTriangle,
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
import { addShoppingListItem } from '../../shopping-lists/api/shoppingListsApi';
import { selectActiveShoppingList } from '../../shopping-lists/utils/selectActiveShoppingList';
import { useShoppingListsQuery } from '../../shopping-lists/hooks/useShoppingLists';
import type { ScanPriceOffer } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ScanResult'>;

const styles = StyleSheet.create({
  productImage: {
    width: 132,
    height: 132,
    borderRadius: 18,
  },
  priceOfferRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(100, 116, 139, 0.16)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
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

function offerLabel(offer: ScanPriceOffer): string {
  return `${offer.store_name} · ${offer.store_branch_name}`;
}

function createPendingScanPayload(routeParams: Props['route']['params']) {
  return {
    barcodeId: routeParams.barcodeId ?? null,
    product: routeParams.product,
    storeProduct: routeParams.storeProduct,
    priceOffers: routeParams.priceOffers ?? [],
    fromSearch: routeParams.fromSearch,
    fromCache: routeParams.fromCache,
  };
}

export function ScanResultScreen({ route, navigation }: Props) {
  const {
    storeBranchId,
    barcodeId,
    product,
    storeProduct,
    fromCache = false,
    fromSearch = false,
    priceOffers = [],
  } = route.params;
  const [addedToActiveList, setAddedToActiveList] = useState(false);
  const [showNoActivePurchaseModal, setShowNoActivePurchaseModal] = useState(false);

  const shoppingListsQuery = useShoppingListsQuery();
  const activeShoppingList = selectActiveShoppingList(shoppingListsQuery.data);
  const queryClient = useQueryClient();
  const reportBarcodeMutation = useReportIncorrectBarcodeMutation();

  const heroOffer = useMemo(() => {
    if (storeProduct) {
      return priceOffers.find((offer) => offer.store_product_id === storeProduct.id) ?? priceOffers[0] ?? null;
    }
    return priceOffers[0] ?? null;
  }, [priceOffers, storeProduct]);

  const heroPrice = storeProduct?.current_price ?? heroOffer?.current_price ?? null;
  const heroBranchLabel = storeProduct
    ? `Sucursal ${storeProduct.store_branch_id}`
    : heroOffer
      ? offerLabel(heroOffer)
      : null;
  const isQuickScan = storeBranchId == null;

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

  const handleReportIncorrect = () => {
    if (barcodeId == null) {
      return;
    }
    reportBarcodeMutation.mutate(barcodeId, {
      onSuccess: () => navigation.replace('Scan', storeBranchId == null ? undefined : { storeBranchId }),
    });
  };

  const handleViewHistory = () => {
    const storeProductId = storeProduct?.id ?? heroOffer?.store_product_id ?? null;
    if (!storeProductId) {
      return;
    }
    navigation.navigate('PriceHistory', { storeProductId });
  };

  const handleCreateAlert = () => {
    const alertStoreBranchId = storeProduct?.store_branch_id ?? heroOffer?.store_branch_id ?? storeBranchId ?? null;
    navigation.navigate('CreateAlert', {
      productId: product.id,
      productName: product.canonical_name,
      storeBranchId: alertStoreBranchId,
    });
  };

  const handleCompare = () => {
    navigation.getParent()?.navigate('Comparator' as never);
  };

  const handleAddToActiveList = async () => {
    if (!activeShoppingList) {
      setShowNoActivePurchaseModal(true);
      return;
    }
    await addToActiveListMutation.mutateAsync();
  };

  const handleStartNewPurchase = () => {
    setShowNoActivePurchaseModal(false);
    navigation.navigate('BranchSelect', {
      pendingScan: createPendingScanPayload(route.params),
    });
  };

  const handleAddToNewPurchase = () => {
    navigation.navigate('BranchSelect', {
      pendingScan: createPendingScanPayload(route.params),
    });
  };

  const topOffers = priceOffers.slice(0, 6);

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
                width={132}
                height={132}
                borderRadius={18}
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
                    {isQuickScan ? 'Escaneo rápido' : fromSearch ? 'Búsqueda manual' : 'Código validado'}
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

        <Card elevation={3} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
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
                {isQuickScan ? 'Precio más bajo' : 'Precio encontrado'}
              </Text>
              <Text fontFamily="$heading" fontSize="$xl" color="$color">
                {product.canonical_name}
              </Text>
            </YStack>
          </XStack>

          {heroPrice ? (
            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$display" color="$primary">
                ${formatPrice(heroPrice)}
              </Text>
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                {storeProduct?.currency ?? heroOffer?.currency ?? 'USD'}
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                {isQuickScan
                  ? heroBranchLabel
                    ? `Más bajo detectado en ${heroBranchLabel}`
                    : 'Mejor precio detectado en el catálogo'
                  : `Precio en esta sucursal · actualizado ${formatDate(storeProduct?.last_verified_at ?? null)}`}
              </Text>
              {isQuickScan && heroOffer && (
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  {heroOffer.store_name} · {heroOffer.store_branch_name}
                </Text>
              )}
            </YStack>
          ) : (
            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$xl" color="$color">
                Sin precio registrado
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Todavía no tenemos un valor confirmado para este producto.
              </Text>
            </YStack>
          )}

          {fromCache && (
            <XStack alignItems="center" gap="$2" backgroundColor="rgba(255, 255, 255, 0.06)" borderRadius="$3" padding="$3">
              <IconClock color={colorTokens.primary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" flex={1}>
                Sin conexión · precio guardado en caché, puede no ser el actual
              </Text>
            </XStack>
          )}
        </Card>

        {topOffers.length > 0 && (
          <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$sm" color="$color">
                Top 6 precios
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                El precio más bajo arriba y las siguientes mejores opciones debajo.
              </Text>
            </YStack>

            <YStack borderRadius="$4" overflow="hidden">
              {topOffers.map((offer, index) => (
                <XStack
                  key={offer.store_product_id}
                  alignItems="center"
                  justifyContent="space-between"
                  gap="$3"
                  paddingVertical="$3"
                  paddingHorizontal="$2"
                  style={index < topOffers.length - 1 ? styles.priceOfferRow : undefined}
                >
                  <YStack flex={1} gap="$0.5">
                    <Text fontFamily="$heading" fontSize="$sm" color="$color" numberOfLines={2}>
                      {offer.store_name}
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" numberOfLines={2}>
                      {offer.store_branch_name}
                    </Text>
                  </YStack>

                  <YStack alignItems="flex-end" gap="$0.5">
                    <Text fontFamily="$heading" fontSize="$sm" color="$color">
                      ${formatPrice(offer.current_price)}
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                      {offer.availability === 'in_stock' ? 'Disponible' : offer.availability}
                    </Text>
                  </YStack>
                </XStack>
              ))}
            </YStack>
          </Card>
        )}

        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <YStack gap="$1">
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Guardar o comparar
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Elegí si querés sumar este producto a una compra activa o arrancar una nueva.
            </Text>
          </YStack>

          <XStack gap="$2" alignItems="center" flexWrap="wrap">
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
                disabled={addToActiveListMutation.isPending || addedToActiveList}
                onPress={handleAddToActiveList}
              >
                {activeShoppingList ? `Agregar a ${activeShoppingList.name}` : 'Agregar a compra'}
              </Button>
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" marginTop="$1">
                {activeShoppingList ? `Compra activa: ${activeShoppingList.name}` : 'No hay compra activa todavía.'}
              </Text>
            </YStack>

            <YStack flex={1} minWidth={180}>
              <Button
                backgroundColor="$surface"
                icon={<IconPlus color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                onPress={handleAddToNewPurchase}
              >
                Agregar a nueva compra
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
              disabled={!storeProduct && !heroOffer}
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

        <Button unstyled onPress={() => navigation.replace('Scan', storeBranchId == null ? undefined : { storeBranchId })}>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Escanear otro producto
          </Text>
        </Button>
      </YStack>

      <Modal transparent visible={showNoActivePurchaseModal} animationType="fade" onRequestClose={() => setShowNoActivePurchaseModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowNoActivePurchaseModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <YStack gap="$3">
              <XStack alignItems="center" gap="$3">
                <YStack
                  width={48}
                  height={48}
                  borderRadius="$full"
                  backgroundColor="rgba(34, 197, 94, 0.12)"
                  alignItems="center"
                  justifyContent="center"
                >
                  <IconAlertTriangle color={colorTokens.primary} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text fontFamily="$heading" fontSize="$lg" color="$color">
                    No hay una compra activa
                  </Text>
                  <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                    Podés crear una compra nueva y elegir tienda/sucursal para seguir con este producto.
                  </Text>
                </YStack>
              </XStack>

              <XStack gap="$2">
                <Button flex={1} backgroundColor="$surface" onPress={() => setShowNoActivePurchaseModal(false)}>
                  Cancelar
                </Button>
                <Button flex={1} backgroundColor="$primary" color="$white" onPress={handleStartNewPurchase}>
                  Nueva compra
                </Button>
              </XStack>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}
