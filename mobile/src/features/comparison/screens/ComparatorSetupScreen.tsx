import { useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { IconMapPin, IconScale } from '../../../app/theme/icons';
import { useShoppingListsQuery } from '../../shopping-lists/hooks/useShoppingLists';
import { useCompareShoppingListMutation } from '../hooks/useComparisonMutations';
import type { ComparisonStackParamList } from '../../../app/navigation/types';

import type { ShoppingList } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ComparisonStackParamList, 'ComparatorSetup'>;

/** Picks a shopping list and a city -- the comparator only ranks branches relevant to that
 * geographic context (see backend `ComparisonService._find_candidate_branches`), never every
 * branch in the country -- then hands the full result to `ComparatorResult`. */
export function ComparatorSetupScreen({ navigation }: Props) {
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [city, setCity] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listsQuery = useShoppingListsQuery();
  const compareMutation = useCompareShoppingListMutation();

  const canCompare = Boolean(selectedList) && city.trim().length > 0;

  const handleCompare = async () => {
    if (!selectedList || !canCompare) {
      return;
    }
    setErrorMessage(null);
    try {
      const result = await compareMutation.mutateAsync({
        shoppingListId: selectedList.id,
        request: { city: city.trim() },
      });
      navigation.navigate('ComparatorResult', { result });
    } catch {
      setErrorMessage('No pudimos comparar tu lista. Verifica la ciudad e intenta de nuevo.');
    }
  };

  return (
    <ScreenContainer scroll={false}>
      <YStack gap="$2">
        <IconScale color="#22C55E" size={32} strokeWidth={1.5} />
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          ¿Qué lista quieres comparar?
        </Text>
      </YStack>

      {listsQuery.isPending && <ActivityIndicator color="#22C55E" />}
      {listsQuery.isError && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          No pudimos cargar tus listas.
        </Text>
      )}

      <FlatList
        data={listsQuery.data ?? []}
        keyExtractor={(list) => String(list.id)}
        renderItem={({ item }) => (
          <XStack
            alignItems="center"
            backgroundColor={selectedList?.id === item.id ? '$primary' : '$surface'}
            borderRadius="$3"
            padding="$3"
            marginBottom="$2"
            onPress={() => setSelectedList(item)}
          >
            <Text
              fontFamily="$body"
              fontSize="$md"
              color={selectedList?.id === item.id ? 'white' : '$color'}
            >
              {item.name}
            </Text>
          </XStack>
        )}
      />

      <YStack gap="$1">
        <XStack alignItems="center" gap="$2">
          <IconMapPin color="#64748B" size={18} strokeWidth={1.75} />
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Ciudad
          </Text>
        </XStack>
        <Input value={city} onChangeText={setCity} placeholder="Ej. Panamá" fontSize="$lg" />
      </YStack>

      {errorMessage && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          {errorMessage}
        </Text>
      )}

      <Button
        backgroundColor="$primary"
        color="white"
        disabled={!canCompare || compareMutation.isPending}
        onPress={handleCompare}
      >
        Comparar precios
      </Button>
    </ScreenContainer>
  );
}
