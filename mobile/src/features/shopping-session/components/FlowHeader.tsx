import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { DEFAULT_ICON_STROKE_WIDTH, IconChevronRight } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';

const styles = StyleSheet.create({
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
  },
});

interface FlowHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

export function FlowHeader({ title, subtitle, onBack }: FlowHeaderProps) {
  return (
    <YStack paddingHorizontal="$4" paddingTop="$3" paddingBottom="$2" gap="$3">
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.72, transform: [{ scale: 0.96 }] }]}
        >
          <YStack style={styles.backIcon}>
            <IconChevronRight color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </YStack>
        </Pressable>

        <YStack flex={1} alignItems="center" gap="$0.5">
          <Text fontFamily="$heading" fontSize="$lg" color="$color" textAlign="center">
            {title}
          </Text>
          {subtitle ? (
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="center">
              {subtitle}
            </Text>
          ) : null}
        </YStack>

        <YStack width={40} />
      </XStack>
    </YStack>
  );
}
