import { Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { SUBTLE_ICON_STROKE_WIDTH, IconBuildingStore } from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';

/** Placeholder — store directory/detail is future work, not wired into navigation yet. */
export function StoresScreen() {
  return (
    <ScreenContainer scroll={false}>
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <IconBuildingStore
          color={colorTokens.textSecondary}
          size={40}
          strokeWidth={SUBTLE_ICON_STROKE_WIDTH}
        />
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Tiendas
        </Text>
      </YStack>
    </ScreenContainer>
  );
}
