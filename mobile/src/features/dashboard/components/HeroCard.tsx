import { Button, Card, Text, XStack, YStack } from 'tamagui';

import { DEFAULT_ICON_STROKE_WIDTH, STRONG_ICON_STROKE_WIDTH, IconPlus, IconShoppingCart } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';

interface HeroCardProps {
  hasActiveSession: boolean;
  onPressPrimaryAction: () => void;
}
const primaryPressStyle = { backgroundColor: '$primaryPress' };

/**
 * Dashboard hero: either resumes an active shopping session or offers to
 * start a new one. Primary CTA always uses the brand green (#22C55E).
 */
export function HeroCard({ hasActiveSession, onPressPrimaryAction }: HeroCardProps) {
  return (
    <Card
      elevation={2}
      backgroundColor="$surface"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      padding="$5"
      gap="$4"
    >
      <XStack alignItems="center" gap="$3">
        <YStack
          width={48}
          height={48}
          borderRadius="$full"
          backgroundColor="$primary"
          alignItems="center"
          justifyContent="center"
        >
          <IconShoppingCart color={colorTokens.white} size={26} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        </YStack>

        <YStack flex={1} gap="$1">
          <Text fontFamily="$heading" fontSize="$xl" color="$color">
            {hasActiveSession ? 'Compra activa' : '¿Listo para tu próxima compra?'}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            {hasActiveSession
              ? 'Continuá donde la dejaste.'
              : 'Armá tu lista y comparemos precios en el súper.'}
          </Text>
        </YStack>
      </XStack>

      <Button
        onPress={onPressPrimaryAction}
        backgroundColor="$primary"
        pressStyle={primaryPressStyle}
        borderRadius="$3"
        size="$5"
        icon={<IconPlus color={colorTokens.white} size={20} strokeWidth={STRONG_ICON_STROKE_WIDTH} />}
      >
        <Text fontFamily="$heading" fontSize="$md" color="$white">
          {hasActiveSession ? 'Continuar compra' : 'Nueva compra'}
        </Text>
      </Button>
    </Card>
  );
}
