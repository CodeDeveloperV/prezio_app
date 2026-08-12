import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HTTPError } from 'ky';
import { Button, Input, Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useUpdatePriceMutation } from '../../pricing/hooks/usePricingMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

import type { PriceConflictResponse } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'PriceUpdate'>;

/** "✗ Cambió el precio": submits a version-checked price update. A 409 means someone else
 * changed the price first -- adopt the server's current price/version and let the user retry. */
export function PriceUpdateScreen({ route, navigation }: Props) {
  const [price, setPrice] = useState(route.params.currentPrice);
  const [version, setVersion] = useState(route.params.version);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const updatePriceMutation = useUpdatePriceMutation();

  const handleSubmit = async () => {
    setConflictMessage(null);
    try {
      await updatePriceMutation.mutateAsync({
        storeProductId: route.params.storeProductId,
        request: { price: Number(price), version },
      });
      navigation.goBack();
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 409) {
        const conflict: PriceConflictResponse = await error.response.json();
        setPrice(String(conflict.current_price));
        setVersion(conflict.version);
        setConflictMessage('Alguien más actualizó el precio. Verifica el nuevo valor e intenta de nuevo.');
        return;
      }
      setConflictMessage('No pudimos actualizar el precio. Intenta de nuevo.');
    }
  };

  return (
    <ScreenContainer>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Nuevo precio
        </Text>
      </YStack>

      <Input
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
        placeholder="0.00"
        fontSize="$lg"
      />

      {conflictMessage && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          {conflictMessage}
        </Text>
      )}

      <Button
        backgroundColor="$primary"
        color="white"
        disabled={updatePriceMutation.isPending}
        onPress={handleSubmit}
      >
        Guardar precio
      </Button>
    </ScreenContainer>
  );
}
