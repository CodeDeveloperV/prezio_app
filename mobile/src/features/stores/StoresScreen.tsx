import { Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { IconBuildingStore } from '../../app/theme/icons';

/** Placeholder — store directory/detail is future work, not wired into navigation yet. */
export function StoresScreen() {
  return (
    <ScreenContainer scroll={false}>
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <IconBuildingStore color="#64748B" size={40} strokeWidth={1.5} />
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Tiendas
        </Text>
      </YStack>
    </ScreenContainer>
  );
}
