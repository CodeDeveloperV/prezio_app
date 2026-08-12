import { Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../shared/components/ScreenContainer';
import { IconReceipt } from '../../app/theme/icons';

/** Placeholder — receipt capture/parsing is future work, not wired into navigation yet. */
export function ReceiptScreen() {
  return (
    <ScreenContainer scroll={false}>
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <IconReceipt color="#64748B" size={40} strokeWidth={1.5} />
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Recibo
        </Text>
      </YStack>
    </ScreenContainer>
  );
}
