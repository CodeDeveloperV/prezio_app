import { Button, Card, Text, XStack, YStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  STRONG_ICON_STROKE_WIDTH,
  IconPlus,
  IconShoppingCart,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';

interface HeroCardProps {
  hasActiveSession: boolean;
  activeSessionName?: string | null;
  activeSessionMetric?: string | null;
  onPressPrimaryAction: () => void;
}
const primaryPressStyle = { backgroundColor: '$primaryPress' };

/**
 * Dashboard hero: either resumes an active shopping session or offers to
 * start a new one. Primary CTA always uses the brand green (#22C55E).
 */
export function HeroCard({
  hasActiveSession,
  activeSessionName,
  activeSessionMetric,
  onPressPrimaryAction,
}: HeroCardProps) {
  if (hasActiveSession) {
    return (
      <Card
        elevation={3}
        backgroundColor={colorTokens.textPrimary}
        borderWidth={1}
        borderColor="rgba(255, 255, 255, 0.08)"
        borderRadius="$4"
        padding="$5"
        gap="$5"
      >
        <XStack alignItems="flex-start" gap="$3">
          <YStack
            width={44}
            height={44}
            borderRadius="$full"
            backgroundColor="rgba(34, 197, 94, 0.14)"
            alignItems="center"
            justifyContent="center"
          >
            <IconShoppingCart color={colorTokens.primary} size={24} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </YStack>

          <YStack flex={1} gap="$2">
            <XStack alignItems="center" gap="$2">
              <YStack width={8} height={8} borderRadius="$full" backgroundColor="$primary" />
              <Text fontFamily="$body" fontSize="$xs" letterSpacing={1.2} color="$primary">
                Compra en curso
              </Text>
            </XStack>

            <Text fontFamily="$heading" fontSize="$xl" color="$white">
              {activeSessionName ?? 'Tu compra activa'}
            </Text>
          </YStack>
        </XStack>

        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$display" color="$primary">
            {activeSessionMetric ?? '0 productos pendientes'}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="#CBD5E1">
            Continuá donde la dejaste.
          </Text>
        </YStack>

        <Button
          onPress={onPressPrimaryAction}
          backgroundColor="$primary"
          color={colorTokens.textPrimary}
          pressStyle={primaryPressStyle}
          borderRadius="$4"
          paddingVertical="$3"
          minHeight={52}
        >
          <Text fontFamily="$heading" fontSize="$md" color={colorTokens.textPrimary}>
            Continuar compra
          </Text>
        </Button>
      </Card>
    );
  }

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
          width={52}
          height={52}
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
        color={colorTokens.white}
        pressStyle={primaryPressStyle}
        borderRadius="$4"
        size="$5"
        icon={<IconPlus color={colorTokens.white} size={20} strokeWidth={STRONG_ICON_STROKE_WIDTH} />}
        paddingVertical="$3"
        minHeight={52}
      >
        <Text fontFamily="$heading" fontSize="$md" color="$white">
          Nueva compra
        </Text>
      </Button>
    </Card>
  );
}
