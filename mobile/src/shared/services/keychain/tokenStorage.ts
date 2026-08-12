import * as Keychain from 'react-native-keychain';

/**
 * Secure token storage backed by the OS keystore (Android Keystore /
 * EncryptedSharedPreferences under the hood via react-native-keychain).
 * Tokens are intentionally NOT persisted in AsyncStorage.
 *
 * `StoredTokens` is this module's own internal (camelCase) shape — NOT the
 * wire format. Callers must map the backend's snake_case `TokenResponse`
 * (see @prezio/shared-types) to this shape before calling saveTokens.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

const KEYCHAIN_SERVICE = 'com.prezio.app.auth';

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Keychain.setGenericPassword(tokens.accessToken, tokens.refreshToken, {
    service: KEYCHAIN_SERVICE,
  });
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const credentials = await Keychain.getGenericPassword({
    service: KEYCHAIN_SERVICE,
  });

  if (!credentials) {
    return null;
  }

  return {
    accessToken: credentials.username,
    refreshToken: credentials.password,
  };
}

export async function clearTokens(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
}
