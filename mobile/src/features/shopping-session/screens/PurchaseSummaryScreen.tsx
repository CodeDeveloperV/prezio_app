import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import type { ShoppingListSummaryItem } from '@prezio/shared-types';

import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconAlertTriangle,
  IconMinus,
  IconPlus,
  IconScan,
  IconShoppingCart,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { getShoppingListSummary, updateShoppingListItem } from '../../shopping-lists/api/shoppingListsApi';
import { FlowHeader } from '../components/FlowHeader';
import { showPurchaseSummaryError } from '../purchaseSummaryToast';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'PurchaseSummary'>;

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 132, gap: 12 },
  image: { width: 52, height: 52, borderRadius: 12 },
  placeholder: { width: 52, height: 52, borderRadius: 12 },
  quantityButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34, 197, 94, 0.10)' },
  quantityButtonDisabled: { opacity: 0.45 },
  productBody: { flex: 1 },
});

function formatMoney(amount: string | null): string {
  return `$${Number(amount ?? 0).toFixed(2)}`;
}

function PurchaseItemRow({
  item,
  onChangeQuantity,
  isUpdating,
  onOpen,
}: {
  item: ShoppingListSummaryItem;
  onChangeQuantity: (item: ShoppingListSummaryItem, quantity: number) => void;
  isUpdating: boolean;
  onOpen: () => void;
}) {
  const hasPrice = item.unit_price !== null;
  const canDecrease = item.quantity > 1 && !isUpdating;
  return (
    <Card elevation={2} backgroundColor="$background" borderRadius="$4" paddingHorizontal="$3" paddingVertical="$2">
      <XStack gap="$3" alignItems="center">
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalle de ${item.name}`} onPress={onOpen} style={styles.productBody}>
          <XStack gap="$3" alignItems="center">
            {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="contain" />
        ) : (
          <YStack style={styles.placeholder} backgroundColor="rgba(15, 23, 42, 0.06)" alignItems="center" justifyContent="center">
            <IconShoppingCart color={colorTokens.textSecondary} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </YStack>
        )}
            <YStack flex={1} gap="$0.5">
          <Text fontFamily="$heading" fontSize="$sm" color="$color" numberOfLines={1}>
            {item.name}
          </Text>
          {(item.brand || item.presentation) ? (
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" numberOfLines={1}>
              {[item.brand, item.presentation].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {hasPrice ? (
            <Text fontFamily="$heading" fontSize="$xs" color="$primary">
              {formatMoney(item.unit_price)} c/u
            </Text>
          ) : (
            <XStack alignItems="center" gap="$1">
              <IconAlertTriangle color={colorTokens.warning} size={14} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$body" fontSize="$xs" color="$danger">
                Precio no disponible
              </Text>
            </XStack>
          )}
            </YStack>
          </XStack>
        </Pressable>
        <YStack alignItems="flex-end" alignSelf="stretch" justifyContent="space-between" gap="$1">
          <XStack alignItems="center" gap="$1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Disminuir ${item.name}`}
              disabled={!canDecrease}
              hitSlop={6}
              onPress={() => onChangeQuantity(item, item.quantity - 1)}
              style={[styles.quantityButton, !canDecrease && styles.quantityButtonDisabled]}
            >
              <IconMinus color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Pressable>
            <Text fontFamily="$heading" fontSize="$sm" minWidth={18} textAlign="center">
              {item.quantity}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Aumentar ${item.name}`}
              disabled={isUpdating}
              hitSlop={6}
              onPress={() => onChangeQuantity(item, item.quantity + 1)}
              style={[styles.quantityButton, isUpdating && styles.quantityButtonDisabled]}
            >
              <IconPlus color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </Pressable>
          </XStack>
          <YStack alignItems="flex-end" gap="$0.5">
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">Subtotal</Text>
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              {item.subtotal ? formatMoney(item.subtotal) : '—'}
            </Text>
          </YStack>
        </YStack>
      </XStack>
    </Card>
  );
}

export function PurchaseSummaryScreen({ route, navigation }: Props) {
  const { shoppingListId } = route.params;
  const queryClient = useQueryClient();
  const summaryKey = useMemo(() => ['shoppingLists', shoppingListId, 'summary'] as const, [shoppingListId]);
  const summaryQuery = useQuery({ queryKey: summaryKey, queryFn: () => getShoppingListSummary(shoppingListId) });
  const quantityMutation = useMutation({
    mutationFn: ({ item, quantity }: { item: ShoppingListSummaryItem; quantity: number }) =>
      updateShoppingListItem(shoppingListId, item.shopping_list_item_id, { version: item.version, quantity }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: summaryKey }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: summaryKey });
      showPurchaseSummaryError('Revisa tu conexión e inténtalo de nuevo.');
    },
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: summaryKey });
    }, [queryClient, summaryKey]),
  );

  const openScanner = () => {
    navigation.navigate('Scan', { storeBranchId: summaryQuery.data?.active_store_branch_id ?? undefined, scanFlow: 'purchase' });
  };

  if (summaryQuery.isPending) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <ActivityIndicator color={colorTokens.primary} />
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">Cargando tu compra…</Text>
      </YStack>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <YStack flex={1} backgroundColor="$background" padding="$4" justifyContent="center" gap="$3">
        <Text fontFamily="$heading" fontSize="$lg">No pudimos cargar tu compra</Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">Vuelve a intentarlo para consultar los precios actuales.</Text>
        <Button backgroundColor="$primary" color="$white" onPress={() => summaryQuery.refetch()}>Reintentar</Button>
      </YStack>
    );
  }

  const summary = summaryQuery.data;
  const branchLabel = summary.store_name && summary.branch_name ? `${summary.store_name} · ${summary.branch_name}` : 'Sucursal sin seleccionar';
  const isEmpty = summary.items.length === 0;
  const totalLabel = summary.pricing_status === 'complete' ? 'Total estimado' : 'Subtotal conocido';

  return (
    <YStack flex={1} backgroundColor="$background">
      <FlatList
        data={summary.items}
        keyExtractor={(item) => String(item.shopping_list_item_id)}
        renderItem={({ item }) => (
          <PurchaseItemRow
            item={item}
            isUpdating={quantityMutation.isPending}
            onChangeQuantity={(target, quantity) => quantityMutation.mutate({ item: target, quantity })}
            onOpen={() => navigation.navigate('ShoppingListItemDetail', { shoppingListId, itemId: item.shopping_list_item_id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <YStack gap="$3">
            <FlowHeader title="Mi compra" subtitle={branchLabel} onBack={() => navigation.goBack()} />
            <YStack gap="$2">
              <XStack gap="$3">
                <Card flex={1} elevation={2} backgroundColor="$background" borderRadius="$4" padding="$2" minHeight={84} alignItems="center" justifyContent="center" gap="$1">
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="center">Productos</Text>
                  <Text fontFamily="$heading" fontSize="$xl" color="$color" textAlign="center">
                    {summary.total_units_count}
                  </Text>
                </Card>
                <Card flex={1} elevation={2} backgroundColor="$background" borderRadius="$4" padding="$2" minHeight={84} alignItems="center" justifyContent="center" gap="$1">
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="center">{totalLabel}</Text>
                  <Text fontFamily="$heading" fontSize="$xl" color="$primary" textAlign="center">
                    {summary.priced_subtotal ? formatMoney(summary.priced_subtotal) : '—'}
                  </Text>
                </Card>
              </XStack>
              {summary.unpriced_items_count > 0 ? (
                <XStack alignItems="center" gap="$2.5" paddingHorizontal="$1">
                  <IconAlertTriangle color={colorTokens.warning} size={15} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                    {summary.unpriced_items_count} {summary.unpriced_items_count === 1 ? 'producto sin precio disponible' : 'productos sin precio disponible'}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
            {isEmpty ? (
              <YStack alignItems="center" paddingVertical="$8" gap="$2">
                <YStack width={56} height={56} borderRadius="$full" backgroundColor="rgba(34, 197, 94, 0.12)" alignItems="center" justifyContent="center">
                  <IconShoppingCart color={colorTokens.primary} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </YStack>
                <Text fontFamily="$heading" fontSize="$lg">Tu compra está vacía</Text>
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">Escanea tu primer producto para comenzar.</Text>
              </YStack>
            ) : (
              <Text fontFamily="$heading" fontSize="$sm" marginTop="$1">Productos ({summary.distinct_products_count})</Text>
            )}
          </YStack>
        }
        ListEmptyComponent={null}
      />
      <YStack backgroundColor="$background" paddingHorizontal="$4" paddingTop="$3" paddingBottom="$3" gap="$2" borderTopWidth={1} borderColor="$borderColor">
        <Button
          backgroundColor="$primary"
          color="$white"
          icon={<IconScan color={colorTokens.white} size={19} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          minHeight={52}
          onPress={openScanner}
        >
          Escanear producto
        </Button>
        {!isEmpty ? (
          /* TODO: enable when the backend exposes a real purchase-finalization operation. */
          <Button backgroundColor="$surface" minHeight={48} disabled>Finalizar compra</Button>
        ) : null}
      </YStack>
    </YStack>
  );
}
