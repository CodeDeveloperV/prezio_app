import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HTTPError } from 'ky';
import { Button, Checkbox, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconCheck,
  IconCrown,
  IconPlus,
  IconTrash,
  IconUserPlus,
  IconUsers,
  IconWifi,
  IconWifiOff,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ProfileStackParamList } from '../../../app/navigation/types';
import { useAuthStore } from '../../../shared/store/authStore';
import { useShoppingListRealtime } from '../hooks/useShoppingListRealtime';
import {
  useAddShoppingListItemMutation,
  useArchiveShoppingListMutation,
  useDeleteShoppingListItemMutation,
  useRemoveShoppingListMemberMutation,
  useUpdateShoppingListItemMutation,
} from '../hooks/useShoppingListMutations';
import {
  useShoppingListItemsQuery,
  useShoppingListMembersQuery,
  useShoppingListQuery,
} from '../hooks/useShoppingListQueries';

import type { ShoppingListItem, ShoppingListItemConflictResponse, ShoppingListMember } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ShoppingListDetail'>;

const styles = StyleSheet.create({
  listContent: {
    gap: 8,
  },
});

function MemberRow({
  member,
  isCurrentUser,
  canRemove,
  onRemove,
}: {
  member: ShoppingListMember;
  isCurrentUser: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <XStack alignItems="center" gap="$2" backgroundColor="$surface" borderRadius="$2" padding="$2">
      {member.role === 'owner' && (
        <IconCrown color={colorTokens.primary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
      )}
      <Text fontFamily="$body" fontSize="$xs" color="$color">
        Usuario #{member.user_id}
        {isCurrentUser ? ' (Tú)' : ''}
      </Text>
      {canRemove && (
        <Button size="$1" circular chromeless onPress={onRemove}>
          <IconTrash color={colorTokens.danger} size={12} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </Button>
      )}
    </XStack>
  );
}

function ItemRow({
  item,
  canEdit,
  onToggleChecked,
  onDelete,
}: {
  item: ShoppingListItem;
  canEdit: boolean;
  onToggleChecked: () => void;
  onDelete: () => void;
}) {
  return (
    <XStack
      alignItems="center"
      gap="$3"
      backgroundColor="$surface"
      borderRadius="$3"
      padding="$3"
    >
      <Checkbox checked={item.checked} disabled={!canEdit} onCheckedChange={onToggleChecked}>
        <Checkbox.Indicator>
          <IconCheck color={colorTokens.primary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </Checkbox.Indicator>
      </Checkbox>
      <YStack flex={1}>
        <Text
          fontFamily="$body"
          fontSize="$sm"
          color={item.checked ? '$colorSecondary' : '$color'}
          textDecorationLine={item.checked ? 'line-through' : 'none'}
        >
          Producto #{item.product_id}
        </Text>
        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
          Cantidad: {item.quantity}
        </Text>
      </YStack>
      {canEdit && (
        <Button size="$2" circular chromeless onPress={onDelete}>
          <IconTrash color={colorTokens.danger} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </Button>
      )}
    </XStack>
  );
}

/** Shows a list's items and members with live updates over WS, gated by the caller's role
 * (owner/editor). Item checks/edits use the same version-based optimistic-concurrency
 * pattern as pricing: a stale version comes back as HTTP 409 with the current item state. */
export function ShoppingListDetailScreen({ route, navigation }: Props) {
  const { shoppingListId, shoppingListName } = route.params;
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [productIdInput, setProductIdInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const { connectionStatus } = useShoppingListRealtime(shoppingListId);
  const listQuery = useShoppingListQuery(shoppingListId);
  const membersQuery = useShoppingListMembersQuery(shoppingListId);
  const itemsQuery = useShoppingListItemsQuery(shoppingListId);

  const addItemMutation = useAddShoppingListItemMutation(shoppingListId);
  const updateItemMutation = useUpdateShoppingListItemMutation(shoppingListId);
  const deleteItemMutation = useDeleteShoppingListItemMutation(shoppingListId);
  const removeMemberMutation = useRemoveShoppingListMemberMutation(shoppingListId);
  const archiveListMutation = useArchiveShoppingListMutation();

  const members = membersQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const shoppingList = listQuery.data;
  const isArchived = shoppingList?.status === 'archived';

  const currentMember = members.find((member) => member.user_id === currentUserId);
  const isOwner = currentMember?.role === 'owner';
  // Owner or editor can edit items; VIEWER isn't modeled yet so any member can edit.
  const canEditItems = currentMember !== undefined && !isArchived;

  const handleAddItem = () => {
    const productId = Number(productIdInput);
    const quantity = Number(quantityInput) || 1;
    if (!productId || Number.isNaN(productId)) {
      return;
    }
    addItemMutation.mutate(
      { product_id: productId, quantity },
      { onSuccess: () => setProductIdInput('') },
    );
  };

  const handleToggleChecked = async (item: ShoppingListItem) => {
    setConflictMessage(null);
    try {
      await updateItemMutation.mutateAsync({
        itemId: item.id,
        request: { version: item.version, checked: !item.checked },
      });
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 409) {
        const conflict: ShoppingListItemConflictResponse = await error.response.json();
        setConflictMessage(
          `"${conflict.item.product_id}" fue modificado por alguien más. La lista se actualizó.`,
        );
        itemsQuery.refetch();
        return;
      }
      setConflictMessage('No pudimos actualizar el producto. Intenta de nuevo.');
    }
  };

  if (listQuery.isLoading || membersQuery.isLoading || itemsQuery.isLoading) {
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
      <YStack flex={1} padding="$4" gap="$3">
        <XStack justifyContent="space-between" alignItems="center">
          <YStack flex={1}>
            <Text fontFamily="$heading" fontSize="$lg" color="$color">
              {shoppingListName}
            </Text>
            {isArchived && (
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                Archivada · solo lectura
              </Text>
            )}
          </YStack>
          {connectionStatus === 'connected' ? (
            <IconWifi color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          ) : (
            <IconWifiOff color={colorTokens.danger} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          )}
        </XStack>

        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <IconUsers color={colorTokens.textSecondary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isCurrentUser={member.user_id === currentUserId}
              canRemove={isOwner && member.role !== 'owner'}
              onRemove={() => removeMemberMutation.mutate(member.user_id)}
            />
          ))}
          {!isArchived && (
            <Button
              size="$2"
              circular
              chromeless
              onPress={() => navigation.navigate('InviteMember', { shoppingListId })}
            >
              <IconUserPlus color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Button>
          )}
        </XStack>

        {conflictMessage && (
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            {conflictMessage}
          </Text>
        )}

        {!isArchived && (
          <XStack gap="$2" alignItems="center">
            <Input
              flex={1}
              keyboardType="number-pad"
              value={productIdInput}
              onChangeText={setProductIdInput}
              placeholder="ID de producto"
            />
            <Input width={60} keyboardType="number-pad" value={quantityInput} onChangeText={setQuantityInput} />
            <Button size="$3" circular backgroundColor="$primary" onPress={handleAddItem}>
              <IconPlus color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Button>
          </XStack>
        )}

        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onRefresh={() => itemsQuery.refetch()}
          refreshing={itemsQuery.isRefetching}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              canEdit={canEditItems}
              onToggleChecked={() => handleToggleChecked(item)}
              onDelete={() => deleteItemMutation.mutate(item.id)}
            />
          )}
          ListEmptyComponent={
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
              Esta lista todavía no tiene productos.
            </Text>
          }
        />

        {isOwner && !isArchived && (
          <Button
            backgroundColor="$surface"
            onPress={() => archiveListMutation.mutate(shoppingListId)}
          >
            <Text fontFamily="$body" fontSize="$sm" color="$danger">
              Archivar lista
            </Text>
          </Button>
        )}
      </YStack>
    </ScreenContainer>
  );
}
