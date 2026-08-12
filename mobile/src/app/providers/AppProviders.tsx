import type { PropsWithChildren } from 'react';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../theme/tamagui.config';
import { queryClient } from './queryClient';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme ?? 'light'}>
          <QueryClientProvider client={queryClient}>
            <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
            {children}
          </QueryClientProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
