import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Checkbox, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconCheck,
  IconBuildingStore,
  IconClock,
  IconCrown,
  IconMinus,
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
import { useArchiveShoppingListMutation, useRemoveShoppingListMemberMutation } from '../hooks/useShoppingListMutations';
import { useShoppingListMembersQuery, useShoppingListQuery } from '../hooks/useShoppingListQueries';
import { useOfflineShoppingList, useOfflineShoppingListItems } from '../hooks/useOfflineShoppingLists';
import {
  addShoppingListItemOffline,
  changeItemQuantityOffline,
  deleteShoppingListItemOffline,
  setItemCheckedOffline,
} from '../services/offline/offlineShoppingListActions';
import { runSync } from '../services/offline/shoppingListSyncEngine';

import type ShoppingListItem from '../../../shared/services/db/models/ShoppingListItem';
import type { ShoppingListMember } from '@prezio/shared-types';

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
  onIncrement,
  onDecrement,
  onDelete,
}: {
  item: ShoppingListItem;
  canEdit: boolean;
  onToggleChecked: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onDelete: () => void;
}) {
  return (
    <XStack alignItems="center" gap="$3" backgroundColor="$surface" borderRadius="$3" padding="$3">
      <Checkbox checked={item.checked} disabled={!canEdit} onCheckedChange={onToggleChecked}>
        <Checkbox.Indicator>
          <IconCheck color={colorTokens.primary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </Checkbox.Indicator>
      </Checkbox>
      <YStack flex={1}>
        <XStack alignItems="center" gap="$1">
          <Text
            fontFamily="$body"
            fontSize="$sm"
            color={item.checked ? '$colorSecondary' : '$color'}
            textDecorationLine={item.checked ? 'line-through' : 'none'}
          >
            Producto #{item.productId}
          </Text>
          {!item.synced && (
            <IconClock color={colorTokens.textSecondary} size={12} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          )}
        </XStack>
      </YStack>
      {canEdit && (
        <XStack alignItems="center" gap="$1">
          <Button size="$2" circular chromeless disabled={item.quantity <= 1} onPress={onDecrement}>
            <IconMinus color={colorTokens.textPrimary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </Button>
          <Text fontFamily="$body" fontSize="$sm" color="$color" minWidth={20} textAlign="center">
            {item.quantity}
          </Text>
          <Button size="$2" circular chromeless onPress={onIncrement}>
            <IconPlus color={colorTokens.textPrimary} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </Button>
        </XStack>
      )}
      {canEdit && (
        <Button size="$2" circular chromeless onPress={onDelete}>
          <IconTrash color={colorTokens.danger} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </Button>
      )}
    </XStack>
  );
}

/**
 * Shows a list's items with live updates over WS, gated by the caller's role (owner/editor).
 * Items read from WatermelonDB (Epic 14 offline mode) -- every edit here (add/check/quantity/
 * delete) is optimistic-local + queued for sync, never a direct network call. Membership,
 * invites, and archiving remain online-only and stay on React Query, keyed off the list's
 * server id once it has synced.
 */
export function ShoppingListDetailScreen({ route, navigation }: Props) {
  const { shoppingListId, shoppingListName } = route.params;
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [productIdInput, setProductIdInput] = useState('');

  const list = useOfflineShoppingList(shoppingListId);
  const { items, isLoading: itemsLoading, refresh: refreshItems } = useOfflineShoppingListItems(shoppingListId);

  const serverId = list?.serverId ? Number(list.serverId) : undefined;
  const { connectionStatus } = useShoppingListRealtime(shoppingListId, serverId);
  // An unsynced list can't have been archived by anyone else yet -- see useShoppingListQuery,
  // this is intentionally scoped to the online-only "archived" concept, not a general fallback.
  const listQuery = useShoppingListQuery(serverId);
  const membersQuery = useShoppingListMembersQuery(serverId);

  const removeMemberMutation = useRemoveShoppingListMemberMutation(serverId ?? -1);
  const archiveListMutation = useArchiveShoppingListMutation();

  const members = membersQuery.data ?? [];
  const isArchived = listQuery.data?.status === 'archived';

  const currentMember = members.find((member) => member.user_id === currentUserId);
  const isOwner = currentMember?.role === 'owner';
  // Owner or editor can edit items; VIEWER isn't modeled yet so any member can edit. While the
  // list hasn't synced there are no members yet either, but its creator can always edit it.
  const canEditItems = (serverId === undefined || currentMember !== undefined) && !isArchived;

  const handleAddItem = async () => {
    const productId = Number(productIdInput);
    if (!productId || Number.isNaN(productId)) {
      return;
    }
    setProductIdInput('');
    await addShoppingListItemOffline({
      shoppingListLocalId: shoppingListId,
      productId: String(productId),
      productName: `Producto #${productId}`,
      quantity: 1,
    });
    runSync().catch(() => undefined);
  };

  const handleToggleChecked = async (item: ShoppingListItem) => {
    await setItemCheckedOffline(item, !item.checked);
    runSync().catch(() => undefined);
  };

  const handleQuantityChange = async (item: ShoppingListItem, delta: number) => {
    await changeItemQuantityOffline(item, delta);
    runSync().catch(() => undefined);
  };

  const handleDeleteItem = async (item: ShoppingListItem) => {
    await deleteShoppingListItemOffline(item);
    runSync().catch(() => undefined);
  };

  if (!list || itemsLoading) {
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
          {!isArchived &&
            (serverId !== undefined ? (
              <Button
                size="$2"
                circular
                chromeless
                onPress={() => navigation.navigate('InviteMember', { shoppingListId: serverId })}
              >
                <IconUserPlus color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </Button>
            ) : (
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                Invitar requiere conexión
              </Text>
            ))}
        </XStack>

        {!isArchived && canEditItems && (
          <Button
            justifyContent="flex-start"
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius="$3"
            padding="$3"
            disabled={serverId === undefined}
            onPress={() =>
              serverId !== undefined &&
              navigation.navigate('SetActiveBranch', { shoppingListId: serverId, shoppingListLocalId: shoppingListId })
            }
          >
            <XStack alignItems="center" gap="$2" flex={1}>
              <IconBuildingStore color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <YStack flex={1}>
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  Sucursal activa
                </Text>
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  {serverId === undefined
                    ? 'Elegir sucursal requiere conexión'
                    : list.activeStoreBranchId
                      ? `Sucursal #${list.activeStoreBranchId}`
                      : 'Elegir sucursal'}
                </Text>
              </YStack>
            </XStack>
          </Button>
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
            <Button size="$3" circular backgroundColor="$primary" onPress={handleAddItem}>
              <IconPlus color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Button>
          </XStack>
        )}

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={refreshItems}
          refreshing={false}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              canEdit={canEditItems}
              onToggleChecked={() => handleToggleChecked(item)}
              onIncrement={() => handleQuantityChange(item, 1)}
              onDecrement={() => handleQuantityChange(item, -1)}
              onDelete={() => handleDeleteItem(item)}
            />
          )}
          ListEmptyComponent={
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
              Esta lista todavía no tiene productos.
            </Text>
          }
        />

        {isOwner && !isArchived && serverId !== undefined && (
          <Button backgroundColor="$surface" onPress={() => archiveListMutation.mutate(serverId)}>
            <Text fontFamily="$body" fontSize="$sm" color="$danger">
              Archivar lista
            </Text>
          </Button>
        )}
      </YStack>
    </ScreenContainer>
  );
}
