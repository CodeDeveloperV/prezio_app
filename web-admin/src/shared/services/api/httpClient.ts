import ky from 'ky';

import { useAuthStore } from '@/shared/store/authStore';
import { clearTokens, saveTokens } from '@/shared/services/storage/tokenStorage';
import { API_BASE_URL } from './config';

import type { RefreshRequest, TokenResponse } from '@prezio/shared-types';

const RETRY_HEADER = 'x-prezio-refreshed';

/** Bare client, no auth hooks -- used internally to call POST /auth/refresh
 * without triggering the 401 interceptor recursively. */
const refreshClient = ky.create({ prefixUrl: API_BASE_URL, retry: 0 });

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    return null;
  }

  try {
    const body: RefreshRequest = { refresh_token: refreshToken };
    const { access_token, refresh_token } = await refreshClient
      .post('auth/refresh', { json: body })
      .json<TokenResponse>();

    saveTokens({ accessToken: access_token, refreshToken: refresh_token });
    useAuthStore.getState().setSession({
      user: useAuthStore.getState().user,
      tokens: { accessToken: access_token, refreshToken: refresh_token },
    });

    return access_token;
  } catch {
    clearTokens();
    useAuthStore.getState().clearSession();
    return null;
  }
}

/**
 * Main API client. Attaches the current access token to every request and,
 * on a 401, attempts a single POST /auth/refresh + retry before giving up.
 */
export const httpClient = ky.create({
  prefixUrl: API_BASE_URL,
  retry: 0,
  hooks: {
    beforeRequest: [
      (request) => {
        const { accessToken } = useAuthStore.getState();
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        const alreadyRetried = request.headers.get(RETRY_HEADER) === '1';
        if (response.status !== 401 || alreadyRetried) {
          return response;
        }

        // Coalesce concurrent 401s into a single refresh call.
        refreshPromise ??= refreshAccessToken();
        const newAccessToken = await refreshPromise;
        refreshPromise = null;

        if (!newAccessToken) {
          return response;
        }

        const retryRequest = request.clone();
        retryRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);
        retryRequest.headers.set(RETRY_HEADER, '1');
        return httpClient(retryRequest);
      },
    ],
  },
});
