import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useBarcodeScannerOutput, type TargetBarcodeFormat } from 'react-native-vision-camera-barcode-scanner';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconAlertTriangle,
  IconBarcode,
  IconHistory,
  IconScan,
} from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { searchCatalogProducts } from '../catalog/api/catalogApi';
import { useScanBarcodeMutation } from '../catalog/hooks/useCatalogMutations';
import { cacheScanResult, findCachedBarcode } from '../../shared/services/db/catalogCache';
import type { ProductMatchCandidate, ScanPriceOffer, ScanProductDetails, StoreProductRead } from '@prezio/shared-types';
import type { ShoppingSessionStackParamList } from '../../app/navigation/types';
import { FlowHeader } from './components/FlowHeader';
import { showScanErrorToast } from './scanToast';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'Scan'>;

type ScanMode = 'scan' | 'history' | 'manual';

type RecentScanEntry = {
  id: string;
  scannedAt: string;
  source: 'barcode' | 'manual' | 'cached';
  scanFlow: 'quick' | 'purchase';
  barcodeId: number | null;
  storeBranchId: number | null;
  barcode: string | null;
  product: ScanProductDetails;
  storeProduct: StoreProductRead | null;
  priceOffers: ScanPriceOffer[];
};

const RECENT_SCANS_KEY = ['shopping-session', 'recent-scans'] as const;

// Must be a stable reference: useBarcodeScannerOutput memoizes the camera output against this
// array, and a fresh literal on every render would tear down and recreate the camera session
// (visible as the preview never activating until re-renders settle) on every parent re-render.
const SCAN_BARCODE_FORMATS: TargetBarcodeFormat[] = ['all-formats'];

const styles = StyleSheet.create({
  cameraCard: {
    overflow: 'hidden',
  },
  cameraSurface: {
    minHeight: 360,
  },
  frameCorner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: 'rgba(255,255,255,0.94)',
  },
  frameTopLeft: {
    top: 22,
    left: 22,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 20,
  },
  frameTopRight: {
    top: 22,
    right: 22,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 20,
  },
  frameBottomLeft: {
    bottom: 22,
    left: 22,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 20,
  },
  frameBottomRight: {
    bottom: 22,
    right: 22,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 20,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  scrollBody: {
    flex: 1,
  },
  scrollBodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
});

const recentScanPressStyle = { opacity: 0.92 };

function formatPrice(price: string | number | null | undefined): string {
  if (price == null) {
    return '--';
  }
  const numeric = Number(price);
  if (Number.isNaN(numeric)) {
    return String(price);
  }
  return numeric.toLocaleString('es-PA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(entry: Pick<RecentScanEntry, 'source' | 'scanFlow'>): string {
  if (entry.source === 'manual') {
    return 'Búsqueda manual';
  }
  if (entry.source === 'cached') {
    return 'Sin conexión';
  }
  return entry.scanFlow === 'purchase' ? 'Compra nueva' : 'Escaneo rápido';
}

function scanSubtitle(scanFlow: 'quick' | 'purchase', routeStoreBranchId: number | undefined): string {
  if (scanFlow === 'purchase') {
    return routeStoreBranchId != null ? 'Compra nueva con sucursal elegida' : 'Compra nueva';
  }
  return routeStoreBranchId != null ? 'Contexto de sucursal activo' : 'Escaneo rápido sin sucursal';
}

function TintedIconBadge({
  icon,
  size = 48,
  backgroundColor,
}: {
  icon: ReactNode;
  size?: number;
  backgroundColor: string;
}) {
  return (
    <YStack
      width={size}
      height={size}
      borderRadius="$full"
      backgroundColor={backgroundColor}
      alignItems="center"
      justifyContent="center"
    >
      {icon}
    </YStack>
  );
}

function ScanModeButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Button
      flex={1}
      backgroundColor={active ? '$primary' : '$surface'}
      color={active ? '$white' : '$color'}
      borderWidth={1}
      borderColor={active ? '$primary' : '$borderColor'}
      borderRadius="$full"
      minHeight={46}
      paddingHorizontal="$3"
      onPress={onPress}
    >
      <XStack alignItems="center" gap="$2">
        {icon}
        <Text fontFamily="$body" fontSize="$sm" color={active ? '$white' : '$color'}>
          {label}
        </Text>
      </XStack>
    </Button>
  );
}

function RecentScanCard({
  entry,
  onPress,
}: {
  entry: RecentScanEntry;
  onPress: () => void;
}) {
  const heroPrice = entry.storeProduct?.current_price ?? entry.priceOffers[0]?.current_price ?? null;
  const heroStore = entry.storeProduct
    ? entry.priceOffers.find((offer) => offer.store_product_id === entry.storeProduct?.id)
    : entry.priceOffers[0] ?? null;

  return (
    <Card
      elevation={2}
      backgroundColor="$surface"
      borderRadius="$4"
      padding="$4"
      gap="$3"
      onPress={onPress}
      pressStyle={recentScanPressStyle}
    >
      <XStack alignItems="center" gap="$3">
        {entry.product.image_url ? (
          <Image source={{ uri: entry.product.image_url }} style={styles.thumbnail} resizeMode="contain" />
        ) : (
          <TintedIconBadge
            size={52}
            backgroundColor="rgba(34, 197, 94, 0.08)"
            icon={<IconBarcode color={colorTokens.primary} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          />
        )}

        <YStack flex={1} gap="$0.5">
          <Text fontFamily="$heading" fontSize="$sm" color="$color" numberOfLines={2}>
            {entry.product.canonical_name}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" numberOfLines={1}>
            {sourceLabel(entry)}
            {entry.storeBranchId != null ? ` · sucursal ${entry.storeBranchId}` : ''}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            {formatShortDate(entry.scannedAt)}
          </Text>
        </YStack>

        <YStack alignItems="flex-end">
          <Text fontFamily="$heading" fontSize="$sm" color="$color">
            ${formatPrice(heroPrice)}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            {heroStore ? heroStore.store_name : 'Sin precio'}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Live barcode scanning now comes from `react-native-vision-camera-barcode-scanner`, which
 * attaches a real MLKit-powered output to the camera on Android and iOS. The manual field
 * remains as a fallback for text search and for cases where the scan needs more context.
 */
export function ScanScreen({ route, navigation }: Props) {
  const routeStoreBranchId = route.params?.storeBranchId;
  const scanFlow = route.params?.scanFlow ?? 'quick';
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanMutation = useScanBarcodeMutation();
  const hasSubmittedRef = useRef(false);
  const [mode, setMode] = useState<ScanMode>('scan');
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

  const recentScansQuery = useQuery({
    queryKey: RECENT_SCANS_KEY,
    queryFn: async () => queryClient.getQueryData<RecentScanEntry[]>(RECENT_SCANS_KEY) ?? [],
    initialData: queryClient.getQueryData<RecentScanEntry[]>(RECENT_SCANS_KEY) ?? [],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const recentScans = recentScansQuery.data ?? [];
  const latestScan = recentScans[0] ?? null;

  const pushRecentScan = useCallback(
    (entry: RecentScanEntry) => {
      queryClient.setQueryData<RecentScanEntry[]>(RECENT_SCANS_KEY, (current = []) => [entry, ...current].slice(0, 6));
    },
    [queryClient],
  );

  const openScanResult = useCallback(
    (
      payload: Omit<RecentScanEntry, 'id' | 'scannedAt' | 'barcode' | 'source'> & {
        barcodeId: number | null;
        storeBranchId: number | null;
        source: RecentScanEntry['source'];
        scanFlow: RecentScanEntry['scanFlow'];
        barcode?: string | null;
        fromSearch?: boolean;
        fromCache?: boolean;
      },
    ) => {
      const entry: RecentScanEntry = {
        id: `${Date.now()}-${payload.product.id}-${payload.source}`,
        scannedAt: new Date().toISOString(),
        source: payload.source,
        scanFlow: payload.scanFlow,
        barcodeId: payload.barcodeId,
        storeBranchId: payload.storeBranchId,
        barcode: payload.barcode ?? null,
        product: payload.product,
        storeProduct: payload.storeProduct,
        priceOffers: payload.priceOffers,
      };
      pushRecentScan(entry);
      navigation.navigate('ScanResult', {
        storeBranchId: payload.storeBranchId,
        barcodeId: payload.barcodeId,
        product: payload.product,
        storeProduct: payload.storeProduct,
        fromSearch: payload.fromSearch,
        fromCache: payload.fromCache,
        priceOffers: payload.priceOffers,
        scanFlow: payload.scanFlow,
      });
    },
    [navigation, pushRecentScan],
  );

  const productSearchQuery = useQuery({
    queryKey: ['catalogProductsSearch', debouncedSearchText, routeStoreBranchId ?? null],
    queryFn: () => searchCatalogProducts(debouncedSearchText, routeStoreBranchId ?? undefined),
    enabled: debouncedSearchText.length >= 5 && mode === 'manual',
    staleTime: 60_000,
  });

  const handleDetectedBarcode = useCallback(
    async (value: string) => {
      if (!value || hasSubmittedRef.current) {
        return;
      }

      hasSubmittedRef.current = true;
      setOfflineNotice(null);

      try {
        const result = await scanMutation.mutateAsync({
          barcode: value,
          ...(routeStoreBranchId !== undefined ? { store_branch_id: routeStoreBranchId } : {}),
        });

        if (result.status === 'found') {
          cacheScanResult(result, value, 'other').catch(() => undefined);
          openScanResult({
            barcodeId: result.barcode_id,
            storeBranchId: routeStoreBranchId ?? null,
            product: result.product,
            storeProduct: result.store_product,
            priceOffers: result.price_offers,
            source: 'barcode',
            scanFlow,
            barcode: value,
          });
        } else if (result.status === 'needs_disambiguation') {
          navigation.replace('ScanDisambiguation', {
            storeBranchId: routeStoreBranchId ?? undefined,
            scanFlow,
            barcode: value,
            barcodeType: 'other',
            candidates: result.candidates,
          });
        } else if (result.status === 'conflict') {
          navigation.replace('ScanDisambiguation', {
            storeBranchId: routeStoreBranchId ?? undefined,
            scanFlow,
            barcode: value,
            barcodeType: 'other',
            candidates: result.candidates.map((candidate) => ({
              product: candidate,
              score: 0,
              matched_on: ['conflict'],
            })) as ProductMatchCandidate[],
          });
        } else {
          navigation.replace('CreateProduct', {
            storeBranchId: routeStoreBranchId ?? undefined,
            scanFlow,
            barcode: value,
            barcodeType: 'other',
          });
        }
      } catch (error) {
        if (error instanceof HTTPError) {
          let message = 'No pudimos validar este código. Intenta de nuevo en unos segundos.';

          try {
            const payload = (await error.response.clone().json()) as {
              detail?: Array<{ loc?: Array<string | number>; msg?: string }> | string;
            };

            if (typeof payload.detail === 'string') {
              message = payload.detail;
            } else if (Array.isArray(payload.detail) && payload.detail.length > 0) {
              const fieldError = payload.detail.find((item) =>
                item.loc?.some((part) => part === 'store_branch_id'),
              );
              message = fieldError?.msg ?? payload.detail[0]?.msg ?? message;
            }
          } catch {
            // Keep the default toast message when the error body cannot be parsed.
          }

          showScanErrorToast({
            title: 'Error al escanear',
            message,
          });
        } else {
          const cached = routeStoreBranchId != null ? await findCachedBarcode(value, routeStoreBranchId) : null;
          if (cached) {
            openScanResult({
              barcodeId: cached.barcodeId,
              storeBranchId: routeStoreBranchId ?? null,
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
              priceOffers: [],
              source: 'cached',
              scanFlow,
              barcode: value,
              fromCache: true,
            });
            return;
          }

          setOfflineNotice('Sin conexión y este producto no está en tu caché. Conéctate para buscarlo.');
        }
      } finally {
        hasSubmittedRef.current = false;
      }
    },
    [navigation, openScanResult, routeStoreBranchId, scanFlow, scanMutation],
  );

  const barcodeScannerOutput = useBarcodeScannerOutput({
    barcodeFormats: SCAN_BARCODE_FORMATS,
    onBarcodeScanned: (barcodes) => {
      if (mode !== 'scan') {
        return;
      }

      const firstBarcode = barcodes[0];
      const barcodeValue = firstBarcode?.rawValue?.trim?.() ?? firstBarcode?.displayValue?.trim?.() ?? '';
      if (!barcodeValue) {
        return;
      }
      handleDetectedBarcode(barcodeValue).catch(() => undefined);
    },
    onError: () => {
      setOfflineNotice('No pudimos activar el lector automático. Usa la búsqueda manual.');
    },
  });

  const handleSubmit = useCallback(() => {
    const value = searchText.trim();
    if (!value || hasSubmittedRef.current) {
      return;
    }
    if (value.length < 5) {
      setOfflineNotice('Escribe al menos 5 caracteres para buscar coincidencias.');
      return;
    }

    setOfflineNotice(null);

    if (/^\d{5,}$/.test(value)) {
      handleDetectedBarcode(value).catch(() => undefined);
      return;
    }

    setDebouncedSearchText(value);
    setMode('manual');
  }, [handleDetectedBarcode, searchText]);

  const helperCard = useMemo(() => {
    if (mode === 'history') {
      return (
        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
          <Text fontFamily="$heading" fontSize="$md" color="$color">
            Historial de escaneo
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Acá ves los últimos productos escaneados durante esta sesión.
          </Text>
        </Card>
      );
    }

    if (mode === 'manual') {
      return (
        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
          <Text fontFamily="$heading" fontSize="$md" color="$color">
            Búsqueda manual
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Busca por nombre, marca, presentación o código. Requiere al menos 5 caracteres.
          </Text>
        </Card>
      );
    }

    if (mode === 'scan' && scanFlow === 'purchase') {
      return null;
    }

    return (
      <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
        <XStack alignItems="center" gap="$3">
          <TintedIconBadge
            size={48}
            backgroundColor="rgba(34, 197, 94, 0.10)"
            icon={<IconScan color={colorTokens.primary} size={24} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          />
          <YStack flex={1} gap="$1">
            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Escaneo rápido
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Abre la cámara, lee el producto y mira el precio más bajo con su top de ofertas.
            </Text>
          </YStack>
        </XStack>
      </Card>
    );
  }, [mode, scanFlow]);

  const scanHistory = recentScans.length > 0 ? (
    <YStack gap="$2">
      {recentScans.map((entry) => (
        <RecentScanCard
          key={entry.id}
          entry={entry}
          onPress={() =>
            navigation.navigate('ScanResult', {
              storeBranchId: entry.storeBranchId,
              barcodeId: entry.barcodeId,
              product: entry.product,
              storeProduct: entry.storeProduct,
              fromSearch: entry.source === 'manual',
              fromCache: entry.source === 'cached',
              priceOffers: entry.priceOffers,
              scanFlow: entry.scanFlow,
            })
          }
        />
      ))}
    </YStack>
  ) : (
    <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$2">
      <Text fontFamily="$heading" fontSize="$md" color="$color">
        Todavía no hay escaneos
      </Text>
      <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
        Los productos que pases por la cámara aparecerán acá durante esta sesión.
      </Text>
    </Card>
  );

  const manualResults =
    debouncedSearchText.length >= 5 ? (
      productSearchQuery.isFetching ? (
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
            No pudimos buscar productos. Revisa tu conexión e intenta de nuevo.
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
                openScanResult({
                  barcodeId: null,
                  storeBranchId: routeStoreBranchId ?? null,
                  product: item.product,
                  storeProduct: item.store_product,
                  priceOffers: [],
                  source: 'manual',
                  scanFlow,
                  fromSearch: true,
                })
              }
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <TintedIconBadge
                  size={42}
                  backgroundColor="rgba(34, 197, 94, 0.08)"
                  icon={<IconBarcode color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                />
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
                      ${formatPrice(item.store_product.current_price)}
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
      ) : (
        <Card backgroundColor="rgba(15, 23, 42, 0.04)" borderRadius="$3" padding="$3">
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            No encontramos coincidencias con esa búsqueda.
          </Text>
        </Card>
      )
    ) : (
      <Card backgroundColor="rgba(15, 23, 42, 0.04)" borderRadius="$3" padding="$3">
        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
          Escribe al menos 5 caracteres para ver coincidencias.
        </Text>
      </Card>
    );

  const modeSwitcher = (
    <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$2">
      <XStack gap="$2">
        <ScanModeButton
          active={mode === 'scan'}
          label="Escanear"
          icon={<IconScan color={mode === 'scan' ? colorTokens.white : colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          onPress={() => setMode('scan')}
        />
        <ScanModeButton
          active={mode === 'history'}
          label="Historial"
          icon={<IconHistory color={mode === 'history' ? colorTokens.white : colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          onPress={() => setMode('history')}
        />
        <ScanModeButton
          active={mode === 'manual'}
          label="Manual"
          icon={<IconBarcode color={mode === 'manual' ? colorTokens.white : colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          onPress={() => setMode('manual')}
        />
      </XStack>
    </Card>
  );

  const latestScanCard = latestScan ? (
    <YStack gap="$2">
      <Text fontFamily="$heading" fontSize="$sm" color="$color">
        Último elemento escaneado
      </Text>
      <RecentScanCard
        entry={latestScan}
        onPress={() =>
          navigation.navigate('ScanResult', {
            storeBranchId: latestScan.storeBranchId,
            barcodeId: latestScan.barcodeId,
            product: latestScan.product,
            storeProduct: latestScan.storeProduct,
            fromSearch: latestScan.source === 'manual',
            fromCache: latestScan.source === 'cached',
            priceOffers: latestScan.priceOffers,
            scanFlow: latestScan.scanFlow,
          })
        }
      />
    </YStack>
  ) : null;

  if (!hasPermission) {
    return (
      <YStack flex={1} backgroundColor={colorTokens.background}>
        <FlowHeader
          title="Escanear producto"
          subtitle="Necesitamos la cámara para leer códigos de barra."
          onBack={() => navigation.goBack()}
        />
        <YStack flex={1} padding="$4" justifyContent="center">
          <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
            <TintedIconBadge
              size={64}
              backgroundColor="rgba(34, 197, 94, 0.12)"
              icon={<IconBarcode color={colorTokens.primary} size={30} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            />

            <YStack gap="$1">
              <Text fontFamily="$heading" fontSize="$xl" color="$color">
                Necesitamos la cámara
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Prezio necesita acceso a la cámara para escanear códigos de barra.
              </Text>
            </YStack>

            <Button backgroundColor="$primary" color="$white" onPress={requestPermission} minHeight={56}>
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
        subtitle={
          mode === 'scan'
            ? scanSubtitle(scanFlow, routeStoreBranchId)
            : mode === 'history'
              ? 'Revisa los últimos escaneos de esta sesión'
              : 'Busca por nombre, marca, presentación o código'
        }
        onBack={() => navigation.goBack()}
      />

      {mode === 'scan' ? (
        <YStack flex={1} paddingHorizontal="$4" paddingBottom="$4" gap="$4">
          {modeSwitcher}

          {helperCard}

          <YStack gap="$3" flex={1}>
            <YStack
              flex={1}
              borderRadius={28}
              backgroundColor={colorTokens.textPrimary}
              style={[styles.cameraCard, styles.cameraSurface]}
              borderWidth={1}
              borderColor="rgba(15, 23, 42, 0.08)"
            >
              {device ? (
                <Camera
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={hasPermission && isFocused && mode === 'scan'}
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

              <YStack
                flex={1}
                alignItems="center"
                justifyContent="center"
                pointerEvents="none"
              >
                <YStack
                  width={244}
                  height={244}
                  borderRadius={32}
                  borderWidth={2}
                  borderColor="rgba(255, 255, 255, 0.94)"
                  backgroundColor="rgba(255, 255, 255, 0.03)"
                  alignItems="center"
                  justifyContent="center"
                >
                  <YStack
                    width={68}
                    height={68}
                    borderRadius="$full"
                    backgroundColor="rgba(255, 255, 255, 0.12)"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <IconScan color={colorTokens.white} size={30} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </YStack>
                </YStack>
              </YStack>

              <YStack style={[styles.frameCorner, styles.frameTopLeft]} pointerEvents="none" />
              <YStack style={[styles.frameCorner, styles.frameTopRight]} pointerEvents="none" />
              <YStack style={[styles.frameCorner, styles.frameBottomLeft]} pointerEvents="none" />
              <YStack style={[styles.frameCorner, styles.frameBottomRight]} pointerEvents="none" />
            </YStack>

            {offlineNotice && (
              <XStack alignItems="center" gap="$2" backgroundColor="rgba(239, 68, 68, 0.08)" borderRadius="$3" padding="$3">
                <IconAlertTriangle color={colorTokens.danger} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                <Text fontFamily="$body" fontSize="$xs" color="$danger" flex={1}>
                  {offlineNotice}
                </Text>
              </XStack>
            )}
          </YStack>
        </YStack>
      ) : (
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollBodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {modeSwitcher}

          {helperCard}

          {mode === 'manual' ? (
            <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
              <XStack alignItems="center" gap="$2">
                <IconBarcode color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  Búsqueda manual
                </Text>
              </XStack>

              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Busca por nombre, marca, presentación o código. Si quieres validar un barcode exacto, usa el botón.
              </Text>

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

              {manualResults}

              {offlineNotice && (
                <XStack alignItems="center" gap="$2" backgroundColor="rgba(239, 68, 68, 0.08)" borderRadius="$3" padding="$3">
                  <IconAlertTriangle color={colorTokens.danger} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  <Text fontFamily="$body" fontSize="$xs" color="$danger" flex={1}>
                    {offlineNotice}
                  </Text>
                </XStack>
              )}
            </Card>
          ) : null}

          {mode === 'history' ? scanHistory : null}

          {latestScanCard}
        </ScrollView>
      )}
    </YStack>
  );
}
