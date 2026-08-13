import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { runSync } from './shoppingListSyncEngine';

/**
 * Automatic sync triggers (Epic 14 Task 8): reconnecting to the network or bringing the app back
 * to the foreground both retry any pending actions on their own, without requiring the user to
 * make another edit first. Per-mutation `runSync()` calls elsewhere (ShoppingListsScreen,
 * ShoppingListDetailScreen, useOfflineShoppingLists) are unaffected -- this only covers the
 * "walked away and came back" case those don't.
 */
export function startSyncTriggers(): () => void {
  let wasConnected = true;
  let appState: AppStateStatus = AppState.currentState;

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const isConnected = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (isConnected && !wasConnected) {
      runSync().catch(() => undefined);
    }
    wasConnected = isConnected;
  });

  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (/inactive|background/.test(appState) && nextState === 'active') {
      runSync().catch(() => undefined);
    }
    appState = nextState;
  });

  return () => {
    unsubscribeNetInfo();
    appStateSubscription.remove();
  };
}
