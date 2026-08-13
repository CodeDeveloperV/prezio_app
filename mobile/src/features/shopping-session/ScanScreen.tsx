import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HTTPError } from 'ky';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { SUBTLE_ICON_STROKE_WIDTH, IconBarcode } from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { useScanBarcodeMutation } from '../catalog/hooks/useCatalogMutations';
import { cacheScanResult, findCachedBarcode } from '../../shared/services/db/catalogCache';
import type { ShoppingSessionStackParamList } from '../../app/navigation/types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'Scan'>;

/**
 * The installed react-native-vision-camera version (5.x, Nitro rewrite) only implements
 * barcode/object detection on iOS -- its Android CameraObjectOutput is an unimplemented spec
 * stub, and there's no useCodeScanner hook in this version. Until an Android-capable decoding
 * plugin is added, the camera here is preview-only and the barcode is entered manually.
 */
export function ScanScreen({ route, navigation }: Props) {
  const { storeBranchId } = route.params;
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanMutation = useScanBarcodeMutation();
  const hasSubmittedRef = useRef(false);
  const [barcode, setBarcode] = useState('');
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const handleSubmit = useCallback(async () => {
    const value = barcode.trim();
    if (!value || hasSubmittedRef.current) {
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
  }, [barcode, navigation, scanMutation, storeBranchId]);

  if (!hasPermission) {
    return (
      <YStack flex={1} backgroundColor="$surface" alignItems="center" justifyContent="center" gap="$3" padding="$5">
        <IconBarcode color={colorTokens.textSecondary} size={32} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
          Prezio necesita acceso a la cámara para escanear códigos de barra.
        </Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="black">
      {device ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive />
      ) : (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text fontFamily="$body" fontSize="$sm" color="$white">
            Buscando cámara disponible...
          </Text>
        </YStack>
      )}

      <YStack
        position="absolute"
        bottom={0}
        width="100%"
        backgroundColor="$background"
        padding="$4"
        gap="$2"
        borderTopLeftRadius="$4"
        borderTopRightRadius="$4"
      >
        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
          Escaneo automático no disponible en este dispositivo todavía — ingresa el código manualmente.
        </Text>
        <XStack gap="$2">
          <Input
            flex={1}
            placeholder="Código de barras"
            keyboardType="number-pad"
            value={barcode}
            onChangeText={setBarcode}
            onSubmitEditing={handleSubmit}
          />
          <Button
            backgroundColor="$primary"
            color="$white"
            disabled={!barcode.trim() || scanMutation.isPending}
            onPress={handleSubmit}
          >
            {scanMutation.isPending ? <ActivityIndicator color={colorTokens.white} /> : 'Buscar'}
          </Button>
        </XStack>
        {offlineNotice && (
          <Text fontFamily="$body" fontSize="$xs" color="$danger">
            {offlineNotice}
          </Text>
        )}
      </YStack>
    </YStack>
  );
}
