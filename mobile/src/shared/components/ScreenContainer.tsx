import type { PropsWithChildren } from 'react';
import { ScrollView } from 'react-native';
import { YStack } from 'tamagui';

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
      style={{ flex: 1, backgroundColor: 'white' }}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );
}
