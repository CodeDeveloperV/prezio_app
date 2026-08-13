import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { colorTokens } from '../../app/theme/tokens';
import { useAuthStore } from '../../shared/store/authStore';
import { BudgetCard } from './components/BudgetCard';
import { HeroCard } from './components/HeroCard';
import { LastPurchaseCard } from './components/LastPurchaseCard';
import { MonthStatsCard } from './components/MonthStatsCard';
import { MostPurchasedList } from './components/MostPurchasedList';
import { SpendTrendChart } from './components/SpendTrendChart';
import { useDashboardQuery } from './hooks/useDashboardQuery';

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const [hasActiveSession] = useState(false);
  const dashboardQuery = useDashboardQuery();

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
        hasActiveSession={hasActiveSession}
        onPressPrimaryAction={() => {
          // Placeholder — wired to the shopping-session flow in a future slice.
        }}
      />

      {dashboardQuery.isPending && (
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
          <MonthStatsCard
            currentMonth={dashboardQuery.data.current_month}
            previousMonth={dashboardQuery.data.previous_month}
          />

          <BudgetCard
            monthlyBudget={dashboardQuery.data.monthly_budget}
            remainingBudget={dashboardQuery.data.remaining_budget}
          />

          <SpendTrendChart monthlyHistory={dashboardQuery.data.monthly_history} />

          <LastPurchaseCard lastPurchase={dashboardQuery.data.last_purchase} />

          <MostPurchasedList products={dashboardQuery.data.most_purchased_products} />
        </>
      )}
    </ScreenContainer>
  );
}
