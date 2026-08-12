import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Switch, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useCreateAlertMutation } from '../hooks/useAlertMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'CreateAlert'>;

/** "Avísame cuando <product> esté por debajo de <target_price>." Reached from the "Crear
 * alerta" action on ScanResultScreen. `onlyThisBranch` narrows the alert's scope to the
 * branch currently being scanned; off by default (any branch of any chain). */
export function CreateAlertScreen({ route, navigation }: Props) {
  const { productId, productName, storeBranchId } = route.params;
  const [targetPrice, setTargetPrice] = useState('');
  const [onlyThisBranch, setOnlyThisBranch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createAlertMutation = useCreateAlertMutation();

  const handleSubmit = async () => {
    setErrorMessage(null);
    const parsedPrice = Number(targetPrice);
    if (!targetPrice || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage('Ingresa un precio meta válido.');
      return;
    }

    try {
      await createAlertMutation.mutateAsync({
        product_id: productId,
        target_price: parsedPrice,
        store_branch_id: onlyThisBranch && storeBranchId ? storeBranchId : undefined,
      });
      navigation.goBack();
    } catch {
      setErrorMessage('No pudimos crear la alerta. Intenta de nuevo.');
    }
  };

  return (
    <ScreenContainer>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Avísame cuando baje de precio
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          {productName}
        </Text>
      </YStack>

      <Input
        keyboardType="decimal-pad"
        value={targetPrice}
        onChangeText={setTargetPrice}
        placeholder="Precio meta, ej. 5.00"
        fontSize="$lg"
      />

      {storeBranchId && (
        <XStack alignItems="center" justifyContent="space-between">
          <Text fontFamily="$body" fontSize="$sm" color="$color">
            Solo esta sucursal
          </Text>
          <Switch checked={onlyThisBranch} onCheckedChange={setOnlyThisBranch}>
            <Switch.Thumb />
          </Switch>
        </XStack>
      )}

      {errorMessage && (
        <Text fontFamily="$body" fontSize="$sm" color="$danger">
          {errorMessage}
        </Text>
      )}

      <Button
        backgroundColor="$primary"
        color="$white"
        disabled={createAlertMutation.isPending}
        onPress={handleSubmit}
      >
        Crear alerta
      </Button>
    </ScreenContainer>
  );
}
