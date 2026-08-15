import { ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';

import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ShoppingList, ShoppingListItem } from '@prezio/shared-types';

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
import { listShoppingListItems, listShoppingLists } from '../shopping-lists/api/shoppingListsApi';
import { useDashboardQuery } from './hooks/useDashboardQuery';

const analyticsCtaPressStyle = { opacity: 0.7 };

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const dashboardQuery = useDashboardQuery();
  const shoppingListsQuery = useQuery<ShoppingList[], Error>({
    queryKey: ['shoppingLists'],
    queryFn: listShoppingLists,
  });

  const activeShoppingList =
    shoppingListsQuery.data
      ?.slice()
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .find((list) => list.status === 'active') ?? null;

  const activeShoppingListItemsQuery = useQuery<ShoppingListItem[], Error>({
    queryKey: ['shoppingLists', activeShoppingList?.id, 'items'],
    queryFn: () => listShoppingListItems(activeShoppingList!.id),
    enabled: activeShoppingList !== null,
  });

  const activeShoppingListQuantity = activeShoppingListItemsQuery.data?.reduce(
    (total, item) => total + (item.checked ? 0 : item.quantity),
    0,
  );
  let activeSessionMetric: string | null = null;
  if (activeShoppingList !== null) {
    if (activeShoppingListItemsQuery.isPending) {
      activeSessionMetric = 'Cargando productos...';
    } else if (activeShoppingListQuantity === 0) {
      activeSessionMetric = 'Sin productos pendientes';
    } else {
      activeSessionMetric = `${activeShoppingListQuantity} ${
        activeShoppingListQuantity === 1 ? 'producto pendiente' : 'productos pendientes'
      }`;
    }
  }

  const greetingName = user?.email?.split('@')[0] ?? 'de nuevo';

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
        activeSessionName={activeShoppingList?.name ?? null}
        activeSessionMetric={activeShoppingList !== null ? activeSessionMetric : null}
        onPressPrimaryAction={() => {
          navigation.navigate('NewPurchase', { screen: 'BranchSelect', params: {} });
        }}
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
