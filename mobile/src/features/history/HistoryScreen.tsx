import { Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { SUBTLE_ICON_STROKE_WIDTH, IconHistory } from '../../app/theme/icons';
import { colorTokens } from '../../app/theme/tokens';

/** Placeholder for the "Historial" tab — real purchase history is future work. */
export function HistoryScreen() {
  return (
    <ScreenContainer scroll={false}>
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <IconHistory color={colorTokens.textSecondary} size={40} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Historial
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
          Tus compras anteriores van a aparecer acá.
        </Text>
      </YStack>
    </ScreenContainer>
  );
}
