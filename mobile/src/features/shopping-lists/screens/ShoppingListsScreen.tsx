import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  SUBTLE_ICON_STROKE_WIDTH,
  IconChevronRight,
  IconPlus,
  IconReceipt,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ProfileStackParamList } from '../../../app/navigation/types';
import { useCreateShoppingListMutation } from '../hooks/useShoppingListMutations';
import { useShoppingListsQuery } from '../hooks/useShoppingLists';

import type { ShoppingList } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ShoppingLists'>;

const styles = StyleSheet.create({
  listContent: {
    gap: 12,
    padding: 16,
  },
});

const rowPressStyle = { opacity: 0.7 };

function ShoppingListRow({ list, onPress }: { list: ShoppingList; onPress: () => void }) {
  return (
    <XStack
      onPress={onPress}
      backgroundColor="$surface"
      borderRadius="$3"
      padding="$3"
      alignItems="center"
      gap="$3"
      pressStyle={rowPressStyle}
    >
      <YStack
        width={40}
        height={40}
        borderRadius="$2"
        backgroundColor="$background"
        alignItems="center"
        justifyContent="center"
      >
        <IconReceipt color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
      </YStack>
      <Text flex={1} fontFamily="$heading" fontSize="$sm" color="$color">
        {list.name}
      </Text>
      <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
    </XStack>
  );
}

/** "Mis listas": every ACTIVE shopping list the user is a member of (owner or editor). */
export function ShoppingListsScreen({ navigation }: Props) {
  const [newListName, setNewListName] = useState('');
  const listsQuery = useShoppingListsQuery();
  const createListMutation = useCreateShoppingListMutation();
  const lists = listsQuery.data ?? [];

  const handleCreate = () => {
    const name = newListName.trim();
    if (!name) {
      return;
    }
    createListMutation.mutate({ name }, { onSuccess: () => setNewListName('') });
  };

  if (listsQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator color={colorTokens.primary} />
        </YStack>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <YStack gap="$4" flex={1} padding="$4">
        <XStack gap="$2" alignItems="center">
          <Input
            flex={1}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="Nueva lista, ej. Supermercado"
          />
          <Button
            size="$3"
            circular
            backgroundColor="$primary"
            disabled={createListMutation.isPending}
            onPress={handleCreate}
          >
            <IconPlus color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </Button>
        </XStack>

        <FlatList
          data={lists}
          keyExtractor={(list) => String(list.id)}
          contentContainerStyle={styles.listContent}
          onRefresh={() => listsQuery.refetch()}
          refreshing={listsQuery.isRefetching}
          renderItem={({ item }) => (
            <ShoppingListRow
              list={item}
              onPress={() =>
                navigation.navigate('ShoppingListDetail', {
                  shoppingListId: item.id,
                  shoppingListName: item.name,
                })
              }
            />
          )}
          ListEmptyComponent={
            <YStack alignItems="center" gap="$2" padding="$5">
              <IconReceipt color={colorTokens.textSecondary} size={28} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
                Todavía no tienes listas. Crea una arriba para empezar a compartir compras.
              </Text>
            </YStack>
          }
        />
      </YStack>
    </ScreenContainer>
  );
}
