import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  STRONG_ICON_STROKE_WIDTH,
  IconBellRinging,
  IconCheck,
  IconEdit,
  IconFlag,
  IconHistory,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useReportIncorrectBarcodeMutation } from '../../catalog/hooks/useCatalogMutations';
import { useConfirmMatchMutation } from '../../pricing/hooks/usePricingMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ScanResult'>;
const styles = StyleSheet.create({
  productImage: {
    width: 160,
    height: 160,
    borderRadius: 12,
  },
});

function formatDate(iso: string | null): string {
  if (!iso) {
    return 'Sin verificar';
  }
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ScanResultScreen({ route, navigation }: Props) {
  const { storeBranchId, barcodeId, product, storeProduct } = route.params;
  const [confirmedJustNow, setConfirmedJustNow] = useState(false);

  const confirmMatchMutation = useConfirmMatchMutation();
  const reportBarcodeMutation = useReportIncorrectBarcodeMutation();

  const handleConfirmMatch = () => {
    if (!storeProduct) {
      return;
    }
    confirmMatchMutation.mutate(storeProduct.id, {
      onSuccess: () => setConfirmedJustNow(true),
    });
  };

  const handlePriceChanged = () => {
    if (!storeProduct) {
      return;
    }
    navigation.navigate('PriceUpdate', {
      storeProductId: storeProduct.id,
      currentPrice: String(storeProduct.current_price),
      version: storeProduct.version,
    });
  };

  const handleReportIncorrect = () => {
    reportBarcodeMutation.mutate(barcodeId, {
      onSuccess: () => navigation.replace('Scan', { storeBranchId }),
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

  return (
    <ScreenContainer>
      <YStack alignItems="center" gap="$3">
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={styles.productImage}
            resizeMode="contain"
          />
        ) : (
          <YStack width={160} height={160} borderRadius={12} backgroundColor="$surface" />
        )}

        <YStack alignItems="center" gap="$1">
          {product.brand_name && (
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              {product.brand_name}
            </Text>
          )}
          <Text fontFamily="$heading" fontSize="$lg" color="$color" textAlign="center">
            {product.canonical_name}
          </Text>
          {product.presentation && (
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              {product.presentation}
            </Text>
          )}
        </YStack>

        <YStack alignItems="center" gap="$1" backgroundColor="$surface" borderRadius="$3" padding="$4" width="100%">
          {storeProduct ? (
            <>
              <Text fontFamily="$heading" fontSize="$display" color="$primary">
                ${storeProduct.current_price} {storeProduct.currency}
              </Text>
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                Actualizado: {formatDate(confirmedJustNow ? new Date().toISOString() : storeProduct.last_verified_at)}
              </Text>
            </>
          ) : (
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Sin precio registrado en esta sucursal todavía.
            </Text>
          )}
        </YStack>
      </YStack>

      <YStack gap="$2">
        <Button
          disabled={!storeProduct}
          backgroundColor="$primary"
          color="$white"
          icon={<IconCheck color={colorTokens.white} size={18} strokeWidth={STRONG_ICON_STROKE_WIDTH} />}
          onPress={handleConfirmMatch}
        >
          {confirmedJustNow ? 'Confirmado' : 'Coincide'}
        </Button>

        <Button
          disabled={!storeProduct}
          backgroundColor="$surface"
          icon={<IconEdit color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          onPress={handlePriceChanged}
        >
          Cambió el precio
        </Button>

        <Button
          backgroundColor="$surface"
          icon={
            <IconBellRinging
              color={colorTokens.textPrimary}
              size={18}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          }
          onPress={handleCreateAlert}
        >
          Crear alerta
        </Button>

        <XStack gap="$2">
          <Button
            flex={1}
            backgroundColor="$surface"
            icon={<IconFlag color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            onPress={handleReportIncorrect}
          >
            Producto incorrecto
          </Button>
          <Button
            flex={1}
            disabled={!storeProduct}
            backgroundColor="$surface"
            icon={<IconHistory color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
            onPress={handleViewHistory}
          >
            Ver historial
          </Button>
        </XStack>

        <Button unstyled onPress={() => navigation.replace('Scan', { storeBranchId })}>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Escanear otro producto
          </Text>
        </Button>
      </YStack>
    </ScreenContainer>
  );
}
