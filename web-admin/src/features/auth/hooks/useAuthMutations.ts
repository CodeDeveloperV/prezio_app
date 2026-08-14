import { useMutation } from '@tanstack/react-query';

import { useAuthStore } from '@/shared/store/authStore';
import { saveTokens } from '@/shared/services/storage/tokenStorage';
import { getMyMemberships } from '@/features/organizations/api/organizationsApi';
import { getCurrentUser, login, type AuthCredentials } from '../api/authApi';

import type { TokenResponse } from '@prezio/shared-types';

// login only returns tokens (see authApi.ts) -- fetch the user and organization
// memberships separately before completing the session.
async function persistSession(tokens: TokenResponse) {
  const sessionTokens = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  saveTokens(sessionTokens);
  // Seed the access token into the store first so httpClient's beforeRequest hook attaches it
  // to the calls below -- otherwise they go out with no Authorization header and FastAPI's
  // HTTPBearer rejects them with 403 (mirrors the same seeding useSessionBootstrap does).
  useAuthStore.setState({ accessToken: sessionTokens.accessToken, refreshToken: sessionTokens.refreshToken });
  const [user, memberships] = await Promise.all([getCurrentUser(), getMyMemberships()]);
  useAuthStore.getState().setSession({ user, tokens: sessionTokens });
  useAuthStore.getState().setMemberships(memberships);
}

export function useLoginMutation() {
  return useMutation<TokenResponse, Error, AuthCredentials>({
    mutationFn: login,
    onSuccess: persistSession,
  });
}
