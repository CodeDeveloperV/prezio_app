import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { startSyncTriggers } from '../syncTriggers';
import { runSync } from '../shoppingListSyncEngine';

jest.mock('../shoppingListSyncEngine', () => ({
  runSync: jest.fn().mockResolvedValue(undefined),
}));

const mockedAddEventListener = NetInfo.addEventListener as jest.Mock;
const mockedAppStateAddEventListener = AppState.addEventListener as jest.Mock;
const mockedRunSync = runSync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// Spec point 15: "reconectar y sincronizar"
test('triggers a sync only on the offline-to-online edge, not on every "still connected" update', () => {
  let netInfoListener: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void =
    () => undefined;
  mockedAddEventListener.mockImplementation((listener) => {
    netInfoListener = listener;
    return jest.fn();
  });
  mockedAppStateAddEventListener.mockReturnValue({ remove: jest.fn() });

  const stop = startSyncTriggers();

  netInfoListener({ isConnected: true, isInternetReachable: true });
  expect(mockedRunSync).not.toHaveBeenCalled();

  netInfoListener({ isConnected: false, isInternetReachable: false });
  expect(mockedRunSync).not.toHaveBeenCalled();

  netInfoListener({ isConnected: true, isInternetReachable: true });
  expect(mockedRunSync).toHaveBeenCalledTimes(1);

  netInfoListener({ isConnected: true, isInternetReachable: true });
  expect(mockedRunSync).toHaveBeenCalledTimes(1);

  stop();
});

test('triggers a sync when the app returns to the foreground from the background', () => {
  mockedAddEventListener.mockReturnValue(jest.fn());
  let appStateListener: (status: string) => void = () => undefined;
  mockedAppStateAddEventListener.mockImplementation((_event, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  });
  (AppState as unknown as { currentState: string }).currentState = 'background';

  const stop = startSyncTriggers();

  appStateListener('active');
  expect(mockedRunSync).toHaveBeenCalledTimes(1);

  appStateListener('active');
  expect(mockedRunSync).toHaveBeenCalledTimes(1);

  stop();
});
