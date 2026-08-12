import { useEffect } from 'react';

import { useAuthStore } from '../../../shared/store/authStore';
import { clearTokens, loadTokens } from '../../../shared/services/keychain/tokenStorage';
import { getCurrentUser } from '../api/authApi';

/**
 * Runs once on app start. Restores a previously persisted session from the
 * keychain, then calls GET /users/me to hydrate the logged-in user before
 * marking the session authenticated. An expired access token is handled
 * transparently by the httpClient's 401 -> refresh interceptor, which reads
 * the refresh token seeded into the store below.
 */
export function useSessionBootstrap() {
  const finishBootstrap = useAuthStore((state) => state.finishBootstrap);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const tokens = await loadTokens();
      if (cancelled) {
        return;
      }

      if (!tokens) {
        finishBootstrap(null);
        return;
      }

      // Seed the store so httpClient can attach the access token (and its
      // 401 interceptor can refresh it) while we fetch the user profile.
      useAuthStore.setState({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });

      try {
        const user = await getCurrentUser();
        if (!cancelled) {
          finishBootstrap({ user, tokens });
        }
      } catch {
        if (!cancelled) {
          await clearTokens();
          finishBootstrap(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finishBootstrap]);
}
