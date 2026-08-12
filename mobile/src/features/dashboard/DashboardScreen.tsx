import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { useAuthStore } from '../../shared/store/authStore';
import { HeroCard } from './components/HeroCard';
import { StoreQuickAccess } from './components/StoreQuickAccess';
import { RecentListsSection } from './components/RecentListsSection';
import { mockFrequentStores, mockRecentShoppingLists } from './mockData';

export function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const [hasActiveSession] = useState(false);

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

      <StoreQuickAccess
        stores={mockFrequentStores}
        onPressStore={() => {
          // Placeholder — navigates to the stores feature in a future slice.
        }}
      />

      <RecentListsSection
        lists={mockRecentShoppingLists}
        onPressList={() => {
          // Placeholder — navigates to shopping-session detail in a future slice.
        }}
      />
    </ScreenContainer>
  );
}
