import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { YStack } from 'tamagui';

import { useAuthStore } from '../../shared/store/authStore';
import { useSessionBootstrap } from '../../features/auth/hooks/useSessionBootstrap';
import { wsClient } from '../../shared/services/ws/wsClient';
import { colorTokens } from '../theme/tokens';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';

function SplashFallback() {
  return (
    <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center">
      <ActivityIndicator color={colorTokens.primary} />
    </YStack>
  );
}

export function RootNavigator() {
  useSessionBootstrap();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === 'authenticated') {
      wsClient.connect();
      return () => wsClient.disconnect();
    }
    return undefined;
  }, [status]);

  if (status === 'bootstrapping') {
    return <SplashFallback />;
  }

  return (
    <NavigationContainer>
      {status === 'authenticated' ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
