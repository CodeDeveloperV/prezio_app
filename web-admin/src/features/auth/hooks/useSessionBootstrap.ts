import { useEffect } from 'react';

import { useAuthStore } from '@/shared/store/authStore';
import { clearTokens, loadTokens } from '@/shared/services/storage/tokenStorage';
import { getMyMemberships } from '@/features/organizations/api/organizationsApi';
import { getCurrentUser } from '../api/authApi';

/**
 * Runs once on app start. Restores a previously persisted session from
 * localStorage, then calls GET /users/me and GET /b2b/memberships/me to
 * hydrate the logged-in user and its organization scope before marking the
 * session authenticated. An expired access token is handled transparently by
 * the httpClient's 401 -> refresh interceptor, which reads the refresh token
 * seeded into the store below.
 */
export function useSessionBootstrap() {
  const finishBootstrap = useAuthStore((state) => state.finishBootstrap);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const tokens = loadTokens();
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
        const [user, memberships] = await Promise.all([getCurrentUser(), getMyMemberships()]);
        if (!cancelled) {
          finishBootstrap({ user, tokens, memberships });
        }
      } catch {
        if (!cancelled) {
          clearTokens();
          finishBootstrap(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finishBootstrap]);
}
