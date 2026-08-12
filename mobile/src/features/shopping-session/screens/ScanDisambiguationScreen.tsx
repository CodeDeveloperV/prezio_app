import { FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useAttachBarcodeMutation } from '../../catalog/hooks/useCatalogMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

import type { ProductMatchCandidate } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ScanDisambiguation'>;

/** No candidate matched the scanned barcode with full confidence -- let the user either pick
 * one of the ranked candidates (attaches only a new ProductBarcode) or say none match
 * (falls through to CreateProduct, a brand-new Product in PENDING). */
export function ScanDisambiguationScreen({ route, navigation }: Props) {
  const { storeBranchId, barcode, barcodeType, candidates } = route.params;
  const attachBarcodeMutation = useAttachBarcodeMutation();

  const handleSelectCandidate = (candidate: ProductMatchCandidate) => {
    attachBarcodeMutation.mutate(
      {
        productId: candidate.product.id,
        request: { barcode, barcode_type: barcodeType },
      },
      {
        onSuccess: () => navigation.replace('Scan', { storeBranchId }),
      },
    );
  };

  return (
    <ScreenContainer scroll={false}>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          ¿Alguno de estos es tu producto?
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Código escaneado: {barcode}
        </Text>
      </YStack>

      <FlatList
        data={candidates}
        keyExtractor={(candidate) => String(candidate.product.id)}
        renderItem={({ item }) => (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            marginBottom="$2"
            onPress={() => handleSelectCandidate(item)}
          >
            <YStack flex={1}>
              <Text fontFamily="$body" fontSize="$md" color="$color">
                {item.product.canonical_name}
              </Text>
              {item.product.presentation && (
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                  {item.product.presentation}
                </Text>
              )}
            </YStack>
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              {Math.round(item.score * 100)}%
            </Text>
          </XStack>
        )}
      />

      <Button
        backgroundColor="$surface"
        onPress={() => navigation.replace('CreateProduct', { storeBranchId, barcode, barcodeType })}
      >
        Ninguno coincide
      </Button>
    </ScreenContainer>
  );
}
