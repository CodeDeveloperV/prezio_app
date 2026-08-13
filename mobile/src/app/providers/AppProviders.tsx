import type { PropsWithChildren } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast, { BaseToast } from 'react-native-toast-message';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../theme/tamagui.config';
import { queryClient } from './queryClient';
import { IconAlertTriangle } from '../theme/icons';
import { colorTokens, fontFamily } from '../theme/tokens';
import { SyncStatusBanner } from '../../shared/components/SyncStatusBanner';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toast: {
    borderLeftColor: colorTokens.danger,
    borderLeftWidth: 4,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: colorTokens.background,
    marginHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 8,
  },
  toastContent: {
    paddingVertical: 2,
  },
  toastTitle: {
    fontFamily: fontFamily.heading,
    color: colorTokens.textPrimary,
    fontSize: 16,
  },
  toastMessage: {
    fontFamily: fontFamily.body,
    color: colorTokens.textSecondary,
    fontSize: 13,
  },
  toastIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    marginRight: 12,
  },
});

const toastConfig = {
  error: (props: any) => (
    <BaseToast
      {...props}
      style={styles.toast}
      contentContainerStyle={styles.toastContent}
      text1Style={styles.toastTitle}
      text2Style={styles.toastMessage}
      renderLeadingIcon={() => (
        <View style={styles.toastIcon}>
          <IconAlertTriangle color={colorTokens.danger} size={18} />
        </View>
      )}
    />
  ),
};

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
          <QueryClientProvider client={queryClient}>
            <StatusBar
              barStyle="dark-content"
              backgroundColor={colorTokens.background}
              translucent={false}
            />
            {children}
            <SyncStatusBanner />
            <Toast config={toastConfig} />
          </QueryClientProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
