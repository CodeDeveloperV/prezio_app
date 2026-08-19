import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Vibration } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useBarcodeScannerOutput, type TargetBarcodeFormat } from 'react-native-vision-camera-barcode-scanner';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconAlertTriangle,
  IconBarcode,
  IconBolt,
  IconClock,
  IconHistory,
  IconKeyboard,
  IconRefresh,
  IconScan,
  IconX,
} from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { useScanBarcodeMutation } from '../catalog/hooks/useCatalogMutations';
import { cacheScanResult, findCachedBarcode } from '../../shared/services/db/catalogCache';
import { selectActiveShoppingList } from '../shopping-lists/utils/selectActiveShoppingList';
import { useShoppingListsQuery } from '../shopping-lists/hooks/useShoppingLists';
import type { ProductMatchCandidate, ScanPriceOffer, ScanProductDetails, StoreProductRead } from '@prezio/shared-types';
import type { ShoppingSessionStackParamList } from '../../app/navigation/types';
import { showScanErrorToast } from './scanToast';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'Scan'>;

type ScanSheet = 'manual' | 'history' | null;

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

const RECENT_SCANS_LIMIT = 6;

// Must be a stable reference: useBarcodeScannerOutput memoizes the camera output against this
// array, and a fresh literal on every render would tear down and recreate the camera session
// (visible as the preview never activating until re-renders settle) on every parent re-render.
const SCAN_BARCODE_FORMATS: TargetBarcodeFormat[] = ['all-formats'];

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  cameraShell: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  cameraSurface: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(7, 11, 20, 0.34)',
  },
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  headerRow: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    maxWidth: 190,
  },
  flashButtonOn: {
    backgroundColor: 'rgba(34, 197, 94, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.34)',
  },
  frameWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 118,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  frameBox: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameCorner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: colorTokens.primary,
  },
  frameTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 22,
  },
  frameTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 22,
  },
  frameBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 22,
  },
  frameBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 22,
  },
  scanLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 2,
    backgroundColor: 'rgba(34, 197, 94, 0.55)',
    shadowColor: colorTokens.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  centerInstruction: {
    maxWidth: 260,
    textAlign: 'center',
  },
  scanButtonWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 214,
    alignItems: 'center',
  },
  scanButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  scanButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  bottomPanelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  bottomPanel: {
    backgroundColor: 'rgba(10, 14, 24, 0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  actionRow: {
    paddingVertical: 8,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 11, 20, 0.54)',
    justifyContent: 'flex-end',
  },
  sheetScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  sheetCard: {
    backgroundColor: '#0B1220',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  historyThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
});

const recentScanPressStyle = { opacity: 0.94 };

function normalizeBarcodeInput(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function isSupportedBarcodeInput(value: string): boolean {
  if (/^\d+$/.test(value)) {
    return value.length >= 8 && value.length <= 14;
  }

  return /^[A-Za-z0-9._-]{4,32}$/.test(value);
}

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

function sourceLabel(entry: Pick<RecentScanEntry, 'source'>): string {
  if (entry.source === 'manual') {
    return 'Manual';
  }

  if (entry.source === 'cached') {
    return 'Sin conexión';
  }

  return 'Automático';
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

function ScanHistoryCard({
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
      elevation={1}
      backgroundColor="rgba(255, 255, 255, 0.04)"
      borderRadius="$4"
      padding="$3"
      gap="$3"
      onPress={onPress}
      pressStyle={recentScanPressStyle}
    >
      <XStack alignItems="center" gap="$3">
        {entry.product.image_url ? (
          <Image source={{ uri: entry.product.image_url }} style={styles.historyThumb} resizeMode="contain" />
        ) : (
          <TintedIconBadge
            size={52}
            backgroundColor="rgba(34, 197, 94, 0.10)"
            icon={<IconBarcode color={colorTokens.primary} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          />
        )}

        <YStack flex={1} gap="$0.5">
          <Text fontFamily="$heading" fontSize="$sm" color="$white" numberOfLines={2}>
            {entry.product.canonical_name}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.66)" numberOfLines={1}>
            {sourceLabel(entry)}
            {entry.barcode ? ` · ${entry.barcode}` : ''}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.58)">
            {formatShortDate(entry.scannedAt)}
          </Text>
        </YStack>

        <YStack alignItems="flex-end">
          <Text fontFamily="$heading" fontSize="$sm" color="$white">
            ${formatPrice(heroPrice)}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.58)">
            {heroStore ? heroStore.store_name : 'Sin precio'}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}

function ScannerHeader({
  title,
  onClose,
  onToggleTorch,
  torchEnabled,
  hasTorch,
}: {
  title: string;
  onClose: () => void;
  onToggleTorch: () => void;
  torchEnabled: boolean;
  hasTorch: boolean;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.headerWrap}>
      <XStack alignItems="center" justifyContent="space-between" gap="$3" style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onClose}
          style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.78 }]}
        >
          <IconX color={colorTokens.white} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </Pressable>

        <Text
          fontFamily="$heading"
          fontSize="$lg"
          color="$white"
          textAlign="center"
          numberOfLines={1}
          style={styles.headerTitle}
        >
          {title}
        </Text>

        {hasTorch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torchEnabled ? 'Apagar linterna' : 'Encender linterna'}
            onPress={onToggleTorch}
            style={({ pressed }) => [
              styles.headerButton,
              torchEnabled && styles.flashButtonOn,
              pressed && { opacity: 0.78 },
            ]}
          >
            <IconBolt
              color={torchEnabled ? colorTokens.primary : colorTokens.white}
              size={20}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          </Pressable>
        ) : (
          <YStack width={42} />
        )}
      </XStack>
    </SafeAreaView>
  );
}

function ScannerFrame() {
  return (
    <YStack style={styles.frameBox} pointerEvents="none">
      <YStack style={[styles.frameCorner, styles.frameTopLeft]} />
      <YStack style={[styles.frameCorner, styles.frameTopRight]} />
      <YStack style={[styles.frameCorner, styles.frameBottomLeft]} />
      <YStack style={[styles.frameCorner, styles.frameBottomRight]} />
      <YStack style={styles.scanLine} />
    </YStack>
  );
}

function SheetSectionTitle({
  title,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: ReactNode;
}) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$3">
      <XStack alignItems="center" gap="$2" flex={1}>
        <TintedIconBadge
          size={34}
          backgroundColor="rgba(34, 197, 94, 0.12)"
          icon={icon}
        />
        <Text fontFamily="$heading" fontSize="$md" color="$white">
          {title}
        </Text>
      </XStack>

      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text fontFamily="$body" fontSize="$xs" color={colorTokens.primary}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </XStack>
  );
}

export function ScanScreen({ route, navigation }: Props) {
  const routeStoreBranchId = route.params?.storeBranchId;
  const scanFlow = route.params?.scanFlow ?? 'quick';
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const shoppingListsQuery = useShoppingListsQuery();
  const activeShoppingList = selectActiveShoppingList(shoppingListsQuery.data);
  const recentScansKey = useMemo(
    () => ['shopping-session', 'recent-scans', activeShoppingList?.id ?? routeStoreBranchId ?? 'global'] as const,
    [activeShoppingList?.id, routeStoreBranchId],
  );
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanMutation = useScanBarcodeMutation();
  const permissionRequestedRef = useRef(false);
  const lastHandledBarcodeRef = useRef<string | null>(null);
  const inFlightBarcodeRef = useRef<string | null>(null);

  const [sheet, setSheet] = useState<ScanSheet>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraReloadKey, setCameraReloadKey] = useState(0);
  const [cameraIsStarted, setCameraIsStarted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!hasPermission && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      Promise.resolve(requestPermission()).catch(() => undefined);
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (!isFocused) {
      setTorchEnabled(false);
    }
  }, [isFocused]);

  const recentScansQuery = useQuery({
    queryKey: recentScansKey,
    queryFn: async () => queryClient.getQueryData<RecentScanEntry[]>(recentScansKey) ?? [],
    initialData: queryClient.getQueryData<RecentScanEntry[]>(recentScansKey) ?? [],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const recentScans = recentScansQuery.data ?? [];

  const pushRecentScan = useCallback(
    (entry: RecentScanEntry) => {
      queryClient.setQueryData<RecentScanEntry[]>(recentScansKey, (current = []) => [entry, ...current].slice(0, RECENT_SCANS_LIMIT));
    },
    [queryClient, recentScansKey],
  );

  const closeFlow = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.getParent()?.navigate('Dashboard' as never);
  }, [navigation]);

  const resetScanner = useCallback(() => {
    lastHandledBarcodeRef.current = null;
    inFlightBarcodeRef.current = null;
    setValidationMessage(null);
    setCameraErrorMessage(null);
    setCameraIsStarted(false);
    setSheet(null);
    setCameraReloadKey((value) => value + 1);
  }, []);

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

  const processBarcode = useCallback(
    async (rawValue: string, source: 'barcode' | 'manual' | 'cached' = 'barcode') => {
      const barcode = normalizeBarcodeInput(rawValue);
      if (!barcode) {
        setValidationMessage('Escribe o pega un código de barras.');
        return;
      }

      if (!isSupportedBarcodeInput(barcode)) {
        setValidationMessage('Ese código no parece compatible. Revísalo e inténtalo otra vez.');
        return;
      }

      if (isProcessing || inFlightBarcodeRef.current === barcode || lastHandledBarcodeRef.current === barcode) {
        return;
      }

      lastHandledBarcodeRef.current = barcode;
      inFlightBarcodeRef.current = barcode;
      setIsProcessing(true);
      setValidationMessage(null);
      setCameraErrorMessage(null);

      try {
        const result = await scanMutation.mutateAsync({
          barcode,
          ...(routeStoreBranchId !== undefined ? { store_branch_id: routeStoreBranchId } : {}),
        });

        if (result.status === 'found') {
          Vibration.vibrate(35);
          cacheScanResult(result, barcode, 'other').catch(() => undefined);
          openScanResult({
            barcodeId: result.barcode_id,
            storeBranchId: routeStoreBranchId ?? null,
            product: result.product,
            storeProduct: result.store_product,
            priceOffers: result.price_offers,
            source,
            scanFlow,
            barcode,
          });
          return;
        }

        if (result.status === 'needs_disambiguation') {
          navigation.replace('ScanDisambiguation', {
            storeBranchId: routeStoreBranchId ?? undefined,
            scanFlow,
            barcode,
            barcodeType: 'other',
            candidates: result.candidates,
          });
          return;
        }

        if (result.status === 'conflict') {
          navigation.replace('ScanDisambiguation', {
            storeBranchId: routeStoreBranchId ?? undefined,
            scanFlow,
            barcode,
            barcodeType: 'other',
            candidates: result.candidates.map((candidate) => ({
              product: candidate,
              score: 0,
              matched_on: ['conflict'],
            })) as ProductMatchCandidate[],
          });
          return;
        }

        navigation.replace('ProductNotFound', {
          storeBranchId: routeStoreBranchId ?? undefined,
          scanFlow,
          barcode,
          barcodeType: 'other',
        });
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
              const fieldError = payload.detail.find((item) => item.loc?.some((part) => part === 'store_branch_id'));
              message = fieldError?.msg ?? payload.detail[0]?.msg ?? message;
            }
          } catch {
            // Keep the fallback message when the server body cannot be parsed.
          }

          showScanErrorToast({
            title: 'Error al escanear',
            message,
          });
          setValidationMessage(message);
          return;
        }

        const cached = routeStoreBranchId != null ? await findCachedBarcode(barcode, routeStoreBranchId) : null;
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
                  availability: cached.storeProduct.availability as
                    | 'in_stock'
                    | 'out_of_stock'
                    | 'unknown'
                    | 'discontinued',
                  last_verified_at: cached.storeProduct.lastVerifiedAt
                    ? new Date(cached.storeProduct.lastVerifiedAt).toISOString()
                    : null,
                  last_verified_by: null,
                }
              : null,
            priceOffers: [],
            source: 'cached',
            scanFlow,
            barcode,
            fromCache: true,
          });
          return;
        }

        const message = 'No pudimos iniciar la cámara. Puedes intentarlo nuevamente o ingresar el código manualmente.';
        setCameraErrorMessage(message);
      } finally {
        setIsProcessing(false);
        inFlightBarcodeRef.current = null;
      }
    },
    [isProcessing, navigation, openScanResult, routeStoreBranchId, scanFlow, scanMutation],
  );

  const barcodeScannerOutput = useBarcodeScannerOutput({
    barcodeFormats: SCAN_BARCODE_FORMATS,
    onBarcodeScanned: (barcodes) => {
      if (sheet !== null || cameraErrorMessage !== null) {
        return;
      }

      const firstBarcode = barcodes[0];
      const barcodeValue = firstBarcode?.rawValue?.trim?.() ?? firstBarcode?.displayValue?.trim?.() ?? '';
      if (!barcodeValue) {
        return;
      }

      processBarcode(barcodeValue, 'barcode').catch(() => undefined);
    },
    onError: () => {
      setCameraErrorMessage('No pudimos iniciar el lector automático. Puedes intentarlo nuevamente o ingresar el código manualmente.');
    },
  });

  const canUseTorch = Boolean(device?.hasFlash);
  const scannerIsVisible = hasPermission && isFocused && device != null && sheet === null && cameraErrorMessage === null;
  const effectiveTorchMode = scannerIsVisible && cameraIsStarted && torchEnabled && canUseTorch ? 'on' : 'off';
  const scannerStatusMessage = cameraErrorMessage ?? validationMessage;
  const recentBarcodeEntries = recentScans.filter((entry) => entry.barcode).slice(0, 5);

  const handleManualSearch = useCallback(() => {
    processBarcode(barcodeInput, 'manual').catch(() => undefined);
  }, [barcodeInput, processBarcode]);

  const handleHistoryEntryPress = useCallback(
    (entry: RecentScanEntry) => {
      setSheet(null);
      navigation.navigate('ScanResult', {
        storeBranchId: entry.storeBranchId,
        barcodeId: entry.barcodeId,
        product: entry.product,
        storeProduct: entry.storeProduct,
        fromSearch: entry.source === 'manual',
        fromCache: entry.source === 'cached',
        priceOffers: entry.priceOffers,
        scanFlow: entry.scanFlow,
      });
    },
    [navigation],
  );

  const manualSheet = (
    <Modal transparent visible={sheet === 'manual'} animationType="fade" onRequestClose={() => setSheet(null)}>
      <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)}>
        <Pressable style={styles.sheetCard} onPress={() => undefined}>
          <YStack gap="$1">
            <SheetSectionTitle
              title="Ingresar código de barras"
              icon={<IconKeyboard color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            />
            <Text fontFamily="$body" fontSize="$sm" color="rgba(255, 255, 255, 0.70)">
              Escribe o pega el código de barras del producto.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Input
              autoFocus
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoCorrect={false}
              autoCapitalize="none"
              placeholder="Ej. 7501234567897"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              returnKeyType="search"
              minHeight={58}
              paddingHorizontal="$4"
              backgroundColor="rgba(255, 255, 255, 0.08)"
              borderWidth={1}
              borderColor="rgba(255, 255, 255, 0.10)"
              borderRadius="$4"
              color="$white"
              placeholderTextColor="$colorSecondary"
              fontSize="$md"
              fontFamily="$body"
            />

            <XStack gap="$2" alignItems="stretch">
              <Button
                flex={1.35}
                minHeight={52}
                backgroundColor="$primary"
                color="$white"
                disabled={!normalizeBarcodeInput(barcodeInput) || isProcessing}
                onPress={handleManualSearch}
              >
                {isProcessing ? <ActivityIndicator color={colorTokens.white} /> : 'Buscar producto'}
              </Button>
              <Button
                flex={0.85}
                minHeight={52}
                backgroundColor="rgba(255, 255, 255, 0.06)"
                color="$white"
                onPress={() => setBarcodeInput('')}
                disabled={!barcodeInput}
              >
                Limpiar
              </Button>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontFamily="$heading" fontSize="$sm" color="$white">
                Búsquedas recientes
              </Text>
              <Pressable onPress={() => queryClient.setQueryData(recentScansKey, [])}>
                <Text fontFamily="$body" fontSize="$xs" color={colorTokens.primary}>
                  Limpiar
                </Text>
              </Pressable>
            </XStack>

            {recentBarcodeEntries.length > 0 ? (
              <YStack gap="$2">
                {recentBarcodeEntries.map((entry) => (
                  <Pressable
                    key={entry.id}
                    onPress={() => {
                      setSheet(null);
                      if (entry.barcode) {
                        processBarcode(entry.barcode, 'manual').catch(() => undefined);
                      }
                    }}
                  >
                    <Card backgroundColor="rgba(255, 255, 255, 0.04)" borderRadius="$4" padding="$3">
                      <XStack alignItems="center" gap="$2">
                        <IconClock color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                        <Text fontFamily="$body" fontSize="$sm" color="$white">
                          {entry.barcode}
                        </Text>
                      </XStack>
                    </Card>
                  </Pressable>
                ))}
              </YStack>
            ) : (
              <Text fontFamily="$body" fontSize="$sm" color="rgba(255, 255, 255, 0.62)">
                Aún no hay búsquedas recientes en esta compra.
              </Text>
            )}
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const historySheet = (
    <Modal transparent visible={sheet === 'history'} animationType="fade" onRequestClose={() => setSheet(null)}>
      <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)}>
        <Pressable style={styles.sheetCard} onPress={() => undefined}>
          <YStack gap="$1">
            <SheetSectionTitle
              title="Historial de escaneos"
              actionLabel="Cerrar"
              onAction={() => setSheet(null)}
              icon={<IconHistory color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            />
            <Text fontFamily="$body" fontSize="$sm" color="rgba(255, 255, 255, 0.70)">
              Esta compra
            </Text>
          </YStack>

          {recentScans.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetScrollContent}>
              {recentScans.map((entry) => (
                <ScanHistoryCard key={entry.id} entry={entry} onPress={() => handleHistoryEntryPress(entry)} />
              ))}
            </ScrollView>
          ) : (
            <Card backgroundColor="rgba(255, 255, 255, 0.04)" borderRadius="$4" padding="$4">
              <Text fontFamily="$body" fontSize="$sm" color="rgba(255, 255, 255, 0.72)">
                Todavía no has escaneado productos en esta compra.
              </Text>
            </Card>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  const permissionView = (
    <YStack flex={1} backgroundColor={colorTokens.background} padding="$4" justifyContent="center" gap="$4">
      <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
        <TintedIconBadge
          size={64}
          backgroundColor="rgba(34, 197, 94, 0.12)"
          icon={<IconScan color={colorTokens.primary} size={30} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
        />
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$xl" color="$color">
            Necesitamos la cámara
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Prezio necesita acceso a la cámara para escanear códigos de barras.
          </Text>
        </YStack>
        <Button
          backgroundColor="$primary"
          color="$white"
          onPress={() => {
            Promise.resolve(requestPermission()).catch(() => undefined);
          }}
          minHeight={56}
        >
          Permitir cámara
        </Button>
        <Button backgroundColor="$surface" onPress={() => Linking.openSettings().catch(() => undefined)} minHeight={52}>
          Abrir ajustes
        </Button>
      </Card>
    </YStack>
  );

  const cameraUnavailableView = (
    <YStack flex={1} backgroundColor={colorTokens.background} padding="$4" justifyContent="center" gap="$4">
      <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
        <TintedIconBadge
          size={64}
          backgroundColor="rgba(34, 197, 94, 0.12)"
          icon={<IconAlertTriangle color={colorTokens.primary} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
        />
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$xl" color="$color">
            No pudimos iniciar la cámara
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Puedes intentarlo nuevamente o ingresar el código manualmente.
          </Text>
        </YStack>

        <XStack gap="$2">
          <Button
            flex={1}
            backgroundColor="$surface"
            icon={<IconRefresh color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            onPress={resetScanner}
          >
            Intentar otra vez
          </Button>
          <Button flex={1} backgroundColor="$primary" color="$white" onPress={() => setSheet('manual')}>
          Ingresar manualmente
          </Button>
        </XStack>
      </Card>
    </YStack>
  );

  const cameraLoadingView = (
    <YStack flex={1} backgroundColor={colorTokens.background} padding="$4" justifyContent="center" gap="$4">
      <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
        <TintedIconBadge
          size={64}
          backgroundColor="rgba(34, 197, 94, 0.12)"
          icon={<IconScan color={colorTokens.primary} size={30} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
        />
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$xl" color="$color">
            Buscando cámara disponible
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Si este dispositivo no tiene una cámara disponible, puedes seguir con el código manual.
          </Text>
        </YStack>
        <XStack gap="$2" alignItems="center">
          <ActivityIndicator color={colorTokens.primary} />
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Preparando el lector...
          </Text>
        </XStack>
        <XStack gap="$2">
          <Button
            flex={1}
            backgroundColor="$surface"
            icon={<IconRefresh color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            onPress={resetScanner}
          >
            Intentar otra vez
          </Button>
          <Button flex={1} backgroundColor="$primary" color="$white" onPress={() => setSheet('manual')}>
            Ingresar manualmente
          </Button>
        </XStack>
      </Card>
    </YStack>
  );

  if (!hasPermission) {
    return permissionView;
  }

  if (!device && !cameraErrorMessage) {
    return cameraLoadingView;
  }

  if (!device || cameraErrorMessage) {
    return cameraUnavailableView;
  }

  return (
    <YStack style={styles.screen}>
      <YStack style={styles.cameraShell}>
        <YStack style={styles.cameraSurface}>
          <Camera
            key={cameraReloadKey}
            style={styles.camera}
            device={device}
            isActive={scannerIsVisible}
            torchMode={effectiveTorchMode}
            outputs={[barcodeScannerOutput]}
            onStarted={() => setCameraIsStarted(true)}
            onStopped={() => setCameraIsStarted(false)}
            onError={() => {
              setCameraIsStarted(false);
              setCameraErrorMessage('No pudimos iniciar la cámara. Puedes intentarlo nuevamente o ingresar el código manualmente.');
            }}
          />

          <YStack style={styles.overlayBackdrop} pointerEvents="none" />

          <ScannerHeader
            title="Escanear producto"
            onClose={closeFlow}
            onToggleTorch={() => setTorchEnabled((value) => !value)}
            torchEnabled={torchEnabled}
            hasTorch={canUseTorch}
          />

          <YStack style={styles.frameWrap} pointerEvents="none">
            <YStack gap="$4" alignItems="center">
              <Text
                fontFamily="$heading"
                fontSize="$lg"
                color="$white"
                textAlign="center"
                style={styles.centerInstruction}
              >
                Alinea el código de barras
                {'\n'}
                dentro del recuadro
              </Text>
              <ScannerFrame />
            </YStack>
          </YStack>

          <YStack style={styles.scanButtonWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar lectura"
              onPress={resetScanner}
              style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
            >
              <IconScan color={colorTokens.primary} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Pressable>
          </YStack>

          <YStack style={styles.bottomPanelWrap}>
            <Card style={styles.bottomPanel}>
              <YStack gap="$2">
                <Pressable onPress={() => setSheet('history')}>
                  <XStack alignItems="center" gap="$3">
                    <TintedIconBadge
                      size={38}
                      backgroundColor="rgba(255, 255, 255, 0.05)"
                      icon={<IconHistory color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                    />
                    <YStack flex={1} gap="$0.5">
                      <Text fontFamily="$heading" fontSize="$sm" color="$white">
                        Historial de escaneos
                      </Text>
                      <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.66)">
                        Ver productos escaneados
                      </Text>
                    </YStack>
                  </XStack>
                </Pressable>

                <YStack style={styles.actionRow}>
                  <Pressable onPress={() => setSheet('manual')}>
                    <XStack alignItems="center" gap="$3">
                      <TintedIconBadge
                        size={38}
                        backgroundColor="rgba(255, 255, 255, 0.05)"
                        icon={<IconKeyboard color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                      />
                      <YStack flex={1} gap="$0.5">
                        <Text fontFamily="$heading" fontSize="$sm" color="$white">
                          Ingresar manualmente
                        </Text>
                        <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.66)">
                          Buscar por código de barras
                        </Text>
                      </YStack>
                    </XStack>
                  </Pressable>
                </YStack>
              </YStack>
            </Card>
          </YStack>

          {scannerStatusMessage ? (
            <YStack
              position="absolute"
              left={16}
              right={16}
              bottom={238}
              backgroundColor="rgba(15, 23, 42, 0.76)"
              borderRadius="$4"
              padding="$3"
            >
              <Text fontFamily="$body" fontSize="$sm" color="$white" textAlign="center">
                {scannerStatusMessage}
              </Text>
            </YStack>
          ) : null}

          {isProcessing ? (
            <XStack
              alignItems="center"
              gap="$2"
              position="absolute"
              left={16}
              right={16}
              bottom={294}
              backgroundColor="rgba(15, 23, 42, 0.66)"
              borderRadius="$full"
              paddingHorizontal="$3"
              paddingVertical="$2"
              justifyContent="center"
            >
              <ActivityIndicator color={colorTokens.primary} />
              <Text fontFamily="$body" fontSize="$xs" color="$white">
                Buscando producto...
              </Text>
            </XStack>
          ) : null}
        </YStack>
      </YStack>

      {manualSheet}
      {historySheet}
    </YStack>
  );
}
