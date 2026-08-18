import { ActivityIndicator } from 'react-native';
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
  activeSessionBranchLabel?: string | null;
  activeSessionTotal?: string | null;
  activeSessionStatus?: string | null;
  isPrimaryActionLoading?: boolean;
  onPressPrimaryAction: () => void;
}
const primaryPressStyle = { backgroundColor: '$primaryPress' };

/**
 * Dashboard hero: either resumes an active shopping session or offers to
 * start a new one. Primary CTA always uses the brand green (#22C55E).
 */
export function HeroCard({
  hasActiveSession,
  activeSessionBranchLabel,
  activeSessionTotal,
  activeSessionStatus,
  isPrimaryActionLoading = false,
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
        padding="$4"
        gap="$3"
      >
        <YStack gap="$2">
          <XStack
            alignSelf="flex-start"
            alignItems="center"
            gap="$2"
            backgroundColor="rgba(34, 197, 94, 0.14)"
            borderRadius="$full"
            paddingHorizontal="$3"
            paddingVertical="$1.5"
          >
            <YStack width={6} height={6} borderRadius="$full" backgroundColor="$primary" />
            <Text fontFamily="$heading" fontSize="$sm" letterSpacing={1.2} color="$primary">
              Compra en curso
            </Text>
          </XStack>

          <Text fontFamily="$body" fontSize="$md" color="$white">
            {activeSessionBranchLabel ?? 'Tu compra activa'}
          </Text>
        </YStack>

        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$display" color="$primary">
            {activeSessionTotal ?? '$0.00'}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="#CBD5E1">
            {activeSessionStatus ?? 'Aún no has agregado ni escaneado productos.'}
          </Text>
        </YStack>

        <Button
          onPress={onPressPrimaryAction}
          backgroundColor="$primary"
          color={colorTokens.textPrimary}
          disabled={isPrimaryActionLoading}
          pressStyle={primaryPressStyle}
          borderRadius="$4"
          paddingVertical="$2"
          minHeight={56}
          icon={
            isPrimaryActionLoading ? (
              <ActivityIndicator color={colorTokens.textPrimary} />
            ) : (
              <IconPlus color={colorTokens.white} size={20} strokeWidth={STRONG_ICON_STROKE_WIDTH} />
            )
          }
        >
          <Text fontFamily="$heading" fontSize="$md" color={colorTokens.textPrimary}>
            {isPrimaryActionLoading ? 'Abriendo...' : 'Continuar compra'}
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
              ? 'Continúa donde la dejaste.'
              : 'Arma tu lista y comparemos precios en el súper.'}
          </Text>
        </YStack>
      </XStack>

      <Button
        onPress={onPressPrimaryAction}
        backgroundColor="$primary"
        color="$white"
        disabled={isPrimaryActionLoading}
        pressStyle={primaryPressStyle}
        borderRadius="$4"
        size="$5"
        icon={
          isPrimaryActionLoading ? (
            <ActivityIndicator color={colorTokens.white} />
          ) : (
            <IconPlus color={colorTokens.white} size={20} strokeWidth={STRONG_ICON_STROKE_WIDTH} />
          )
        }
        paddingVertical="$2"
        minHeight={56}
      >
        <Text fontFamily="$heading" fontSize="$md" color="$white">
          {isPrimaryActionLoading ? 'Abriendo...' : 'Nueva compra'}
        </Text>
      </Button>
    </Card>
  );
}
