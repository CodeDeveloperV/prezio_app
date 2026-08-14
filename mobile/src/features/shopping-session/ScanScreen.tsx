import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useBarcodeScannerOutput } from 'react-native-vision-camera-barcode-scanner';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  SUBTLE_ICON_STROKE_WIDTH,
  IconAlertTriangle,
  IconBarcode,
  IconScan,
} from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { searchCatalogProducts } from '../catalog/api/catalogApi';
import { useScanBarcodeMutation } from '../catalog/hooks/useCatalogMutations';
import { cacheScanResult, findCachedBarcode } from '../../shared/services/db/catalogCache';
import type { ShoppingSessionStackParamList } from '../../app/navigation/types';
import { FlowHeader } from './components/FlowHeader';
import { selectActiveShoppingList } from '../shopping-lists/utils/selectActiveShoppingList';
import { useShoppingListsQuery } from '../shopping-lists/hooks/useShoppingLists';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'Scan'>;

const styles = StyleSheet.create({
  cameraCard: {
    overflow: 'hidden',
  },
  frameCorner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  frameTopLeft: {
    top: 20,
    left: 20,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 20,
  },
  frameTopRight: {
    top: 20,
    right: 20,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 20,
  },
  frameBottomLeft: {
    bottom: 20,
    left: 20,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 20,
  },
  frameBottomRight: {
    bottom: 20,
    right: 20,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 20,
  },
});

/**
 * Live barcode scanning now comes from `react-native-vision-camera-barcode-scanner`, which
 * attaches a real MLKit-powered output to the camera on Android and iOS. The manual field
 * remains as a fallback for text search and for cases where the scan needs more context.
 */
export function ScanScreen({ route, navigation }: Props) {
  const shoppingListsQuery = useShoppingListsQuery();
  const activeShoppingList = selectActiveShoppingList(shoppingListsQuery.data);
  const defaultStoreBranchId = activeShoppingList?.active_store_branch_id
    ? Number(activeShoppingList.active_store_branch_id)
    : undefined;
  const routeStoreBranchId = route.params?.storeBranchId;
  const storeBranchId =
    typeof routeStoreBranchId === 'number' && Number.isFinite(routeStoreBranchId)
      ? routeStoreBranchId
      : defaultStoreBranchId !== undefined && Number.isFinite(defaultStoreBranchId)
        ? defaultStoreBranchId
        : undefined;
  const storeBranchLabel = storeBranchId !== undefined ? `Sucursal ${storeBranchId}` : 'Elegí una sucursal';
  const hasStoreBranch = storeBranchId !== undefined;
  const isFocused = useIsFocused();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanMutation = useScanBarcodeMutation();
  const hasSubmittedRef = useRef(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, 350);

    return () => {
      clearTimeout(timeout);
    };
  }, [searchText]);

  const productSearchQuery = useQuery({
    queryKey: ['catalogProductsSearch', debouncedSearchText, storeBranchId],
    queryFn: () => searchCatalogProducts(debouncedSearchText, storeBranchId),
    enabled: debouncedSearchText.length >= 5,
    staleTime: 60_000,
  });

  const handleDetectedBarcode = useCallback(
    async (value: string) => {
      if (!value || hasSubmittedRef.current) {
        return;
      }
      if (storeBranchId === undefined) {
        setOfflineNotice('Elegí una sucursal antes de escanear.');
        return;
      }

      hasSubmittedRef.current = true;
      setOfflineNotice(null);

      try {
        const result = await scanMutation.mutateAsync({ barcode: value, store_branch_id: storeBranchId });
        if (result.status === 'found') {
          cacheScanResult(result, value, 'other').catch(() => undefined);
          navigation.replace('ScanResult', {
            storeBranchId,
            barcodeId: result.barcode_id,
            product: result.product,
            storeProduct: result.store_product,
          });
        } else if (result.status === 'needs_disambiguation') {
          navigation.replace('ScanDisambiguation', {
            storeBranchId,
            barcode: value,
            barcodeType: 'other',
            candidates: result.candidates,
          });
        } else {
          navigation.replace('CreateProduct', { storeBranchId, barcode: value, barcodeType: 'other' });
        }
      } catch (error) {
        // A non-HTTP error here means the request never reached the backend (no connection) --
        // fall back to whatever this barcode already has cached locally instead of blocking the
        // scan entirely. An HTTP error (e.g. 4xx) means we're online and the backend rejected the
        // request, so it isn't retried against the cache.
        if (!(error instanceof HTTPError)) {
          const cached = await findCachedBarcode(value, storeBranchId);
          if (cached) {
            navigation.replace('ScanResult', {
              storeBranchId,
              barcodeId: cached.barcodeId,
              product: {
                id: Number(cached.product.id),
                canonical_name: cached.product.canonicalName,
                brand_name: cached.product.brandName,
                presentation: cached.product.presentation,
                image_url: cached.product.imageUrl,
                status: 'approved',
              },
              storeProduct: cached.storeProduct
                ? {
                    id: Number(cached.storeProduct.id),
                    store_branch_id: Number(cached.storeProduct.storeBranchId),
                    product_id: Number(cached.storeProduct.productId),
                    current_price: cached.storeProduct.currentPrice,
                    currency: cached.storeProduct.currency,
                    version: cached.storeProduct.version,
                    availability: cached.storeProduct.availability as 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued',
                    last_verified_at: cached.storeProduct.lastVerifiedAt
                      ? new Date(cached.storeProduct.lastVerifiedAt).toISOString()
                      : null,
                    last_verified_by: null,
                  }
                : null,
              fromCache: true,
            });
          } else {
            setOfflineNotice('Sin conexión y este producto no está en tu caché. Conéctate para buscarlo.');
          }
        }
      } finally {
        hasSubmittedRef.current = false;
      }
    },
    [navigation, scanMutation, storeBranchId],
  );

  const barcodeScannerOutput = useBarcodeScannerOutput({
    barcodeFormats: ['all-formats'],
    onBarcodeScanned: (barcodes) => {
      const rawValue = barcodes[0]?.rawValue?.trim();
      if (!rawValue) {
        return;
      }
      handleDetectedBarcode(rawValue).catch(() => undefined);
    },
    onError: () => {
      setOfflineNotice('No pudimos activar el lector automático. Usá la búsqueda manual.');
    },
  });

  const handleSubmit = useCallback(() => {
    const value = searchText.trim();
    if (!value || hasSubmittedRef.current) {
      return;
    }
    if (value.length < 5) {
      setOfflineNotice('Escribí al menos 5 caracteres para buscar coincidencias.');
      return;
    }
    setOfflineNotice(null);

    if (/^\d{5,}$/.test(value)) {
      if (storeBranchId === undefined) {
        setOfflineNotice('Elegí una sucursal antes de escanear.');
        return;
      }
      handleDetectedBarcode(value).catch(() => undefined);
      return;
    }

    setDebouncedSearchText(value);
  }, [handleDetectedBarcode, searchText, storeBranchId]);

  if (!hasPermission) {
    return (
      <YStack flex={1} backgroundColor={colorTokens.background}>
        <FlowHeader
          title="Escanear producto"
          subtitle={storeBranchLabel}
          onBack={() => navigation.goBack()}
        />
        <YStack flex={1} padding="$4" justifyContent="center">
          <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
            <YStack
              width={64}
              height={64}
              borderRadius="$full"
              backgroundColor="rgba(34, 197, 94, 0.12)"
              alignItems="center"
              justifyContent="center"
            >
              <IconBarcode color={colorTokens.primary} size={30} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
            </YStack>

            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$xl" color="$color">
                Necesitamos la cámara
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Prezio necesita acceso a la cámara para escanear códigos de barra.
              </Text>
            </YStack>

            <Button backgroundColor="$primary" color="$white" onPress={requestPermission}>
              Conceder acceso
            </Button>
          </Card>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor={colorTokens.background}>
      <FlowHeader
        title="Escanear producto"
        subtitle={storeBranchLabel}
        onBack={() => navigation.goBack()}
      />

      <YStack flex={1} paddingHorizontal="$4" paddingBottom="$4" gap="$4">
        <YStack
          flex={1}
          borderRadius={28}
          backgroundColor={colorTokens.textPrimary}
          style={styles.cameraCard}
          borderWidth={1}
          borderColor="rgba(15, 23, 42, 0.08)"
        >
          {device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={hasPermission && isFocused}
              outputs={[barcodeScannerOutput]}
            />
          ) : (
            <YStack flex={1} alignItems="center" justifyContent="center">
              <ActivityIndicator color={colorTokens.primary} />
              <Text fontFamily="$body" fontSize="$sm" color="$white" marginTop="$2">
                Buscando cámara disponible...
              </Text>
            </YStack>
          )}

          <YStack position="absolute" top="$3" left="$3" right="$3" gap="$2">
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
              <Card backgroundColor="rgba(15, 23, 42, 0.72)" borderRadius="$full" paddingHorizontal="$3" paddingVertical="$2">
                <Text fontFamily="$body" fontSize="$xs" color="$white">
                  Listo para validar el precio
                </Text>
              </Card>
              {hasStoreBranch ? (
                <Card
                  backgroundColor="rgba(34, 197, 94, 0.16)"
                  borderRadius="$full"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                >
                  <Text fontFamily="$body" fontSize="$xs" color="$white">
                    {storeBranchLabel}
                  </Text>
                </Card>
              ) : (
                <Button
                  backgroundColor="rgba(34, 197, 94, 0.16)"
                  color="$white"
                  borderRadius="$full"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  minHeight={32}
                  onPress={() => navigation.navigate('BranchSelect')}
                >
                  Elegir sucursal
                </Button>
              )}
            </XStack>
          </YStack>

          <YStack flex={1} alignItems="center" justifyContent="center">
            <YStack width={232} height={232} borderRadius={32} borderWidth={2} borderColor="rgba(255, 255, 255, 0.95)" backgroundColor="rgba(255, 255, 255, 0.03)" alignItems="center" justifyContent="center" gap="$3">
              <YStack
                width={68}
                height={68}
                borderRadius="$full"
                backgroundColor="rgba(255, 255, 255, 0.14)"
                alignItems="center"
                justifyContent="center"
              >
                <IconScan color={colorTokens.white} size={30} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </YStack>
              <Text fontFamily="$heading" fontSize="$lg" color="$white" textAlign="center">
                Apuntá al código
              </Text>
              <Text fontFamily="$body" fontSize="$xs" color="#E2E8F0" textAlign="center" paddingHorizontal="$3">
                Escaneá con la cámara o usá la búsqueda manual de abajo como respaldo.
              </Text>
            </YStack>
          </YStack>

          <YStack position="absolute" bottom="$3" left="$3" right="$3">
            <Card backgroundColor="rgba(15, 23, 42, 0.72)" borderRadius="$4" padding="$3">
              <Text fontFamily="$body" fontSize="$xs" color="#E2E8F0" textAlign="center">
                El lector automático ya está activo. El campo manual queda como respaldo.
              </Text>
            </Card>
          </YStack>

          <YStack style={styles.frameCorner} pointerEvents="none" />
          <YStack style={[styles.frameCorner, styles.frameTopLeft]} pointerEvents="none" />
          <YStack style={[styles.frameCorner, styles.frameTopRight]} pointerEvents="none" />
          <YStack style={[styles.frameCorner, styles.frameBottomLeft]} pointerEvents="none" />
          <YStack style={[styles.frameCorner, styles.frameBottomRight]} pointerEvents="none" />
        </YStack>

        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <XStack alignItems="center" gap="$2">
            <IconBarcode color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Búsqueda manual
            </Text>
          </XStack>

          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Buscá por nombre, marca, presentación o código. Si querés validar un barcode exacto, usá el botón.
          </Text>

          {!hasStoreBranch && (
            <Card backgroundColor="rgba(34, 197, 94, 0.08)" borderRadius="$3" padding="$3">
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" flex={1}>
                  Necesitás una sucursal para buscar el precio exacto.
                </Text>
                <Button chromeless size="$2" onPress={() => navigation.navigate('BranchSelect')}>
                  Elegir
                </Button>
              </XStack>
            </Card>
          )}

          <XStack gap="$2" alignItems="center">
            <Input
              flex={1}
              placeholder="Nombre, marca, presentación o código"
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSubmit}
            />
            <Button
              backgroundColor="$primary"
              color="$white"
              disabled={searchText.trim().length < 5 || scanMutation.isPending}
              onPress={handleSubmit}
              minWidth={112}
            >
              {scanMutation.isPending ? <ActivityIndicator color={colorTokens.white} /> : 'Buscar'}
            </Button>
          </XStack>

          {debouncedSearchText.length < 5 ? (
            <Card backgroundColor="rgba(15, 23, 42, 0.04)" borderRadius="$3" padding="$3">
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                Escribí al menos 5 caracteres para ver coincidencias.
              </Text>
            </Card>
          ) : productSearchQuery.isFetching ? (
            <XStack alignItems="center" gap="$2" backgroundColor="rgba(34, 197, 94, 0.08)" borderRadius="$3" padding="$3">
              <ActivityIndicator color={colorTokens.primary} />
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                Buscando coincidencias...
              </Text>
            </XStack>
          ) : productSearchQuery.isError ? (
            <XStack alignItems="center" gap="$2" backgroundColor="rgba(239, 68, 68, 0.08)" borderRadius="$3" padding="$3">
              <IconAlertTriangle color={colorTokens.danger} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$body" fontSize="$xs" color="$danger" flex={1}>
                No pudimos buscar productos. Revisá tu conexión e intentá de nuevo.
              </Text>
            </XStack>
          ) : productSearchQuery.data && productSearchQuery.data.length > 0 ? (
            <YStack gap="$2">
              {productSearchQuery.data.map((item) => (
                <Button
                  key={item.product.id}
                  backgroundColor="$surface"
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderRadius="$4"
                  padding="$3"
                  minHeight={72}
                  justifyContent="space-between"
                  alignItems="center"
                  onPress={() =>
                    navigation.navigate('ScanResult', {
                      storeBranchId: storeBranchId ?? null,
                      barcodeId: null,
                      product: item.product,
                      storeProduct: item.store_product,
                      fromSearch: true,
                    })
                  }
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
                      <IconBarcode color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                    </YStack>
                    <YStack flex={1} gap="$0.5">
                      <Text fontFamily="$heading" fontSize="$sm" color="$color" textAlign="left" numberOfLines={2}>
                        {item.product.canonical_name}
                      </Text>
                      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="left" numberOfLines={2}>
                        {item.product.brand_name ?? 'Sin marca'}
                        {item.product.presentation ? ` · ${item.product.presentation}` : ''}
                      </Text>
                    </YStack>
                  </XStack>
                  <YStack alignItems="flex-end" gap="$0.5">
                    {item.store_product ? (
                      <>
                        <Text fontFamily="$heading" fontSize="$sm" color="$color" textAlign="right">
                          ${Number(item.store_product.current_price).toLocaleString('es-PA', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </Text>
                        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                          Ver precio
                        </Text>
                      </>
                    ) : (
                      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                        Sin precio en esta sucursal
                      </Text>
                    )}
                  </YStack>
                </Button>
              ))}
            </YStack>
          ) : debouncedSearchText.length >= 5 ? (
            <Card backgroundColor="rgba(15, 23, 42, 0.04)" borderRadius="$3" padding="$3">
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                No encontramos coincidencias con esa búsqueda.
              </Text>
            </Card>
          ) : null}

          {offlineNotice && (
            <XStack alignItems="center" gap="$2" backgroundColor="rgba(239, 68, 68, 0.08)" borderRadius="$3" padding="$3">
              <IconAlertTriangle
                color={colorTokens.danger}
                size={16}
                strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
              />
              <Text fontFamily="$body" fontSize="$xs" color="$danger" flex={1}>
                {offlineNotice}
              </Text>
            </XStack>
          )}
        </Card>
      </YStack>
    </YStack>
  );
}
