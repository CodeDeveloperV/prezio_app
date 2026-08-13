import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  SUBTLE_ICON_STROKE_WIDTH,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconReceipt,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ProfileStackParamList } from '../../../app/navigation/types';
import { useOfflineShoppingLists } from '../hooks/useOfflineShoppingLists';
import { createShoppingListOffline } from '../services/offline/offlineShoppingListActions';
import { runSync } from '../services/offline/shoppingListSyncEngine';

import type ShoppingList from '../../../shared/services/db/models/ShoppingList';

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
      {!list.synced && (
        <IconClock color={colorTokens.textSecondary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
      )}
      <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
    </XStack>
  );
}

/** "Mis listas": reads straight from WatermelonDB (Epic 14 offline mode) so it never waits on a
 * network response -- a pending-sync clock icon marks a list that hasn't reached the backend
 * yet. The consolidated sync-status banner (SyncStatusBanner) covers the aggregate queue. */
export function ShoppingListsScreen({ navigation }: Props) {
  const [newListName, setNewListName] = useState('');
  const { lists, isLoading, refresh } = useOfflineShoppingLists();

  const handleCreate = async () => {
    const name = newListName.trim();
    if (!name) {
      return;
    }
    setNewListName('');
    await createShoppingListOffline(name);
    runSync().catch(() => undefined);
  };

  if (isLoading) {
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
          <Button size="$3" circular backgroundColor="$primary" onPress={handleCreate}>
            <IconPlus color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </Button>
        </XStack>

        <FlatList
          data={lists}
          keyExtractor={(list) => list.id}
          contentContainerStyle={styles.listContent}
          onRefresh={refresh}
          refreshing={false}
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
