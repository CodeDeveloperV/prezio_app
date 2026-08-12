import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { YStack } from 'tamagui';

import { colorTokens } from '../../app/theme/tokens';

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colorTokens.background,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

interface ScreenContainerProps {
  scroll?: boolean;
}

/** Shared full-bleed screen wrapper: base background + consistent padding. */
export function ScreenContainer({
  children,
  scroll = true,
}: PropsWithChildren<ScreenContainerProps>) {
  const content = (
    <YStack flex={1} backgroundColor="$background" padding="$4" gap="$4">
      {children}
    </YStack>
  );

  if (!scroll) {
    return content;
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );
}
