import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { SUBTLE_ICON_STROKE_WIDTH, IconBarcode } from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { useScanBarcodeMutation } from '../catalog/hooks/useCatalogMutations';
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

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const handleSubmit = useCallback(() => {
    const value = barcode.trim();
    if (!value || hasSubmittedRef.current) {
      return;
    }
    hasSubmittedRef.current = true;

    scanMutation.mutate(
      { barcode: value, store_branch_id: storeBranchId },
      {
        onSuccess: (result) => {
          if (result.status === 'found') {
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
        },
        onSettled: () => {
          hasSubmittedRef.current = false;
        },
      },
    );
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
      </YStack>
    </YStack>
  );
}
