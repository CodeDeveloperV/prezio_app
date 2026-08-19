import { ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';

import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ShoppingList } from '@prezio/shared-types';

import { MainTabParamList } from '../../app/navigation/types';
import { DEFAULT_ICON_STROKE_WIDTH, IconChartBar, IconChevronRight } from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';
import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { useAuthStore } from '../../shared/store/authStore';
import { BudgetCard } from './components/BudgetCard';
import { DashboardCard } from './components/DashboardCard';
import { HeroCard } from './components/HeroCard';
import { LastPurchaseCard } from './components/LastPurchaseCard';
import { MonthStatsCard } from './components/MonthStatsCard';
import { MostPurchasedList } from './components/MostPurchasedList';
import { SpendTrendChart } from './components/SpendTrendChart';
import { listStores } from '../stores/api/storesApi';
import { useStoreBranchQuery } from '../stores/hooks/useStores';
import { getShoppingListSummary, listShoppingLists } from '../shopping-lists/api/shoppingListsApi';
import { selectActiveShoppingList } from '../shopping-lists/utils/selectActiveShoppingList';
import { useDashboardQuery } from './hooks/useDashboardQuery';
import { formatMoney } from './utils/format';
import { useState } from 'react';

const analyticsCtaPressStyle = { opacity: 0.7 };

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const queryClient = useQueryClient();
  const [isOpeningNewPurchase, setIsOpeningNewPurchase] = useState(false);
  const dashboardQuery = useDashboardQuery();
  const shoppingListsQuery = useQuery<ShoppingList[], Error>({
    queryKey: ['shoppingLists'],
    queryFn: listShoppingLists,
  });

  const activeShoppingList = selectActiveShoppingList(shoppingListsQuery.data);
  const activePurchaseSummaryQuery = useQuery({
    queryKey: ['shoppingLists', activeShoppingList?.id, 'summary'],
    queryFn: () => getShoppingListSummary(activeShoppingList!.id),
    enabled: activeShoppingList !== null,
  });

  const activeBranchQuery = useStoreBranchQuery(activeShoppingList?.active_store_branch_id);
  const activeBranchLabel = activeBranchQuery.data
    ? `${activeBranchQuery.data.store_name} - ${activeBranchQuery.data.name}`
    : null;

  const activePurchaseSummary = activePurchaseSummaryQuery.data;
  const activeSessionTotal = activePurchaseSummary?.priced_subtotal
    ? formatMoney(activePurchaseSummary.priced_subtotal)
    : '$0.00';
  const activeSessionStatus = activePurchaseSummary
    ? activePurchaseSummary.pricing_status === 'partial'
      ? `Subtotal conocido · ${activePurchaseSummary.unpriced_items_count} producto${activePurchaseSummary.unpriced_items_count === 1 ? '' : 's'} sin precio.`
      : `${activePurchaseSummary.total_units_count} producto${activePurchaseSummary.total_units_count === 1 ? '' : 's'} en tu compra.`
    : activeShoppingList
      ? 'Revisa y continúa tu compra activa.'
      : null;

  const greetingName = user?.email?.split('@')[0] ?? 'de nuevo';

  const handlePrimaryAction = () => {
    setIsOpeningNewPurchase(true);
    queryClient.prefetchQuery({
      queryKey: ['stores'],
      queryFn: listStores,
    }).catch(() => undefined);

    setTimeout(() => {
      if (activeShoppingList) {
        navigation.navigate('NewPurchase', {
          screen: 'PurchaseSummary',
          params: {
            shoppingListId: activeShoppingList.id,
          },
        });
      } else {
        navigation.navigate('NewPurchase', { screen: 'BranchSelect', params: {} });
      }
      setIsOpeningNewPurchase(false);
    }, 0);
  };

  return (
    <ScreenContainer>
      <YStack gap="$1">
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Hola, {greetingName} 👋
        </Text>
        <XStack alignItems="baseline" gap="$2">
          <Text fontFamily="$heading" fontSize="$xxl" color="$color">
            Prezio
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            tu aliado en cada compra
          </Text>
        </XStack>
      </YStack>

      <HeroCard
        hasActiveSession={activeShoppingList !== null}
        activeSessionBranchLabel={activeBranchLabel}
        activeSessionTotal={activeShoppingList !== null ? activeSessionTotal : null}
        activeSessionStatus={activeSessionStatus}
        isPrimaryActionLoading={isOpeningNewPurchase}
        onPressPrimaryAction={handlePrimaryAction}
      />

      {(dashboardQuery.isPending || shoppingListsQuery.isPending) && (
        <YStack alignItems="center" padding="$5">
          <ActivityIndicator color={colorTokens.primary} />
        </YStack>
      )}

      {dashboardQuery.isError && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          No pudimos cargar tu resumen. Desliza para reintentar.
        </Text>
      )}

      {dashboardQuery.isSuccess && (
        <>
          <YStack gap="$3">
            <MonthStatsCard
              currentMonth={dashboardQuery.data.current_month}
              previousMonth={dashboardQuery.data.previous_month}
            />

            <BudgetCard
              monthlyBudget={dashboardQuery.data.monthly_budget}
              remainingBudget={dashboardQuery.data.remaining_budget}
            />
          </YStack>

          <SpendTrendChart monthlyHistory={dashboardQuery.data.monthly_history} />

          <LastPurchaseCard lastPurchase={dashboardQuery.data.last_purchase} />

          <MostPurchasedList products={dashboardQuery.data.most_purchased_products} />

          <DashboardCard
            onPress={() => navigation.navigate('Profile', { screen: 'Analytics' })}
            pressStyle={analyticsCtaPressStyle}
          >
            <XStack alignItems="center" gap="$3">
              <IconChartBar color={colorTokens.primary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <YStack flex={1}>
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  Ver estadísticas
                </Text>
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  Gasto por supermercado, categorías, inflación de tu canasta y más.
                </Text>
              </YStack>
              <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </XStack>
          </DashboardCard>
        </>
      )}
    </ScreenContainer>
  );
}
