/**
 * Token storage backed by localStorage (there is no OS keychain on web). This
 * module's own (camelCase) shape is NOT the wire format -- callers must map the
 * backend's snake_case `TokenResponse` (see @prezio/shared-types) to this shape
 * before calling saveTokens.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_TOKEN_KEY = 'prezio.web-admin.accessToken';
const REFRESH_TOKEN_KEY = 'prezio.web-admin.refreshToken';

export function saveTokens(tokens: StoredTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function loadTokens(): StoredTokens | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
