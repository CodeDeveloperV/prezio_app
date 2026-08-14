import { useState } from 'react';
import { FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconAlertTriangle, IconChevronRight, IconScan } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useAttachBarcodeMutation } from '../../catalog/hooks/useCatalogMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';

import type { ProductMatchCandidate } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ScanDisambiguation'>;

function CandidateSeparator() {
  return <YStack height="$2" />;
}

function CandidateRow({
  candidate,
  isSelected,
  onPress,
}: {
  candidate: ProductMatchCandidate;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      backgroundColor={isSelected ? 'rgba(34, 197, 94, 0.10)' : '$surface'}
      borderWidth={1}
      borderColor={isSelected ? '$primary' : '$borderColor'}
      borderRadius="$4"
      padding="$4"
      justifyContent="space-between"
      alignItems="center"
      onPress={onPress}
    >
      <YStack flex={1} gap="$1" alignItems="flex-start">
        <Text fontFamily="$heading" fontSize="$md" color="$color" textAlign="left">
          {candidate.product.canonical_name}
        </Text>
        {candidate.product.presentation && (
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="left">
            {candidate.product.presentation}
          </Text>
        )}
        <XStack gap="$1" flexWrap="wrap" marginTop="$1">
          {candidate.matched_on.slice(0, 2).map((match) => (
            <YStack key={match} backgroundColor="rgba(15, 23, 42, 0.05)" borderRadius="$full" paddingHorizontal="$2" paddingVertical="$1">
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                {match}
              </Text>
            </YStack>
          ))}
        </XStack>
      </YStack>

      <XStack alignItems="center" gap="$2">
        <YStack backgroundColor="rgba(34, 197, 94, 0.10)" borderRadius="$full" paddingHorizontal="$3" paddingVertical="$1.5">
          <Text fontFamily="$body" fontSize="$xs" color="$primary">
            {Math.round(candidate.score * 100)}%
          </Text>
        </YStack>
        <IconChevronRight
          color={colorTokens.textSecondary}
          size={18}
          strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
        />
      </XStack>
    </Button>
  );
}

/** No candidate matched the scanned barcode with full confidence -- let the user either pick
 * one of the ranked candidates (attaches only a new ProductBarcode) or say none match
 * (falls through to CreateProduct, a brand-new Product in PENDING). */
export function ScanDisambiguationScreen({ route, navigation }: Props) {
  const { storeBranchId, barcode, barcodeType, candidates } = route.params;
  const attachBarcodeMutation = useAttachBarcodeMutation();
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  const handleSelectCandidate = (candidate: ProductMatchCandidate) => {
    setSelectedCandidateId(candidate.product.id);
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
      <FlowHeader
        title="¿Cuál coincide?"
        subtitle={`Código leído: ${barcode}`}
        onBack={() => navigation.goBack()}
      />

      <YStack flex={1} gap="$4" paddingBottom="$4">
        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <XStack alignItems="center" gap="$3">
            <YStack
              width={48}
              height={48}
              borderRadius="$full"
              backgroundColor="rgba(245, 158, 11, 0.10)"
              alignItems="center"
              justifyContent="center"
            >
              <IconAlertTriangle color={colorTokens.warning} size={24} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </YStack>
            <YStack flex={1} gap="$1">
              <Text fontFamily="$heading" fontSize="$lg" color="$color">
                Encontramos varias coincidencias
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Elegí el producto correcto o creá uno nuevo si ninguno coincide.
              </Text>
            </YStack>
          </XStack>
        </Card>

        <FlatList
          data={candidates}
          keyExtractor={(candidate) => String(candidate.product.id)}
          ItemSeparatorComponent={CandidateSeparator}
          renderItem={({ item }) => (
            <CandidateRow
              candidate={item}
              isSelected={selectedCandidateId === item.product.id}
              onPress={() => handleSelectCandidate(item)}
            />
          )}
        />

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <XStack alignItems="center" gap="$2">
            <IconScan color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Ninguno coincide
            </Text>
          </XStack>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Si no ves tu producto, creamos uno nuevo y seguimos con el flujo.
          </Text>
          <Button
            backgroundColor="$primary"
            color="$white"
            onPress={() => navigation.replace('CreateProduct', { storeBranchId, barcode, barcodeType })}
          >
            Crear producto
          </Button>
        </Card>
      </YStack>
    </ScreenContainer>
  );
}
