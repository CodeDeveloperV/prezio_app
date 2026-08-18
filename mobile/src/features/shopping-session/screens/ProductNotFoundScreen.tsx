import { Image, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconCheck, IconClock } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';

const productNotFoundImage = require('../../../assets/images/product_no_find.png');

const styles = StyleSheet.create({
  illustration: {
    width: 154,
    height: 154,
  },
});

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ProductNotFound'>;

function Benefit({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <YStack flex={1} minWidth={144} gap="$1.5" backgroundColor="$surface" borderRadius="$4" padding="$3">
      <XStack alignItems="center" gap="$2">
        {icon}
        <Text fontFamily="$heading" fontSize="$xs" color="$color" flex={1}>
          {title}
        </Text>
      </XStack>
      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
        {description}
      </Text>
    </YStack>
  );
}

export function ProductNotFoundScreen({ route, navigation }: Props) {
  const { barcode, barcodeType, storeBranchId, scanFlow = 'quick' } = route.params;
  const scannerParams = { storeBranchId: storeBranchId ?? undefined, scanFlow };

  return (
    <ScreenContainer scroll={false}>
      <FlowHeader title="" onBack={() => navigation.replace('Scan', scannerParams)} />

      <YStack flex={1} justifyContent="space-between" paddingHorizontal="$4" paddingBottom="$4">
        <YStack alignItems="center" gap="$3" marginTop="$2">
          <Image source={productNotFoundImage} style={styles.illustration} resizeMode="contain" />
          <YStack gap="$1" alignItems="center">
            <Text fontFamily="$heading" fontSize="$xl" color="$color" textAlign="center">
              No encontramos este producto
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
              Código leído: <Text fontFamily="$heading" color="$primary">{barcode}</Text>
            </Text>
          </YStack>
        </YStack>

        <YStack gap="$4">
          <Card elevation={1} backgroundColor={colorTokens.primarySoft} borderRadius="$4" padding="$4" gap="$2">
            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Creemos un producto nuevo
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Completa los datos mínimos para registrar este código y seguir con tu compra.
            </Text>
          </Card>

          <XStack gap="$2" flexWrap="wrap">
            <Benefit
              icon={<IconCheck color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
              title="Quedará con este código"
              description="Tendrás precio, historial y alertas."
            />
            <Benefit
              icon={<IconClock color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
              title="Solo toma un momento"
              description="Luego podrás seguir escaneando."
            />
          </XStack>
        </YStack>

        <YStack gap="$3">
          <Button
            minHeight={56}
            backgroundColor="$primary"
            color="$white"
            onPress={() => navigation.replace('CreateProduct', { barcode, barcodeType, ...scannerParams })}
          >
            Crear producto nuevo
          </Button>
          <Button unstyled onPress={() => navigation.replace('Scan', scannerParams)} minHeight={44}>
            <Text fontFamily="$body" fontSize="$sm" color="$primary" textAlign="center">
              Omitir por ahora y continuar
            </Text>
          </Button>
        </YStack>
      </YStack>
    </ScreenContainer>
  );
}
