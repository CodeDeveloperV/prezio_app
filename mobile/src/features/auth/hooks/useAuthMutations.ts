import { useMutation } from '@tanstack/react-query';

import { useAuthStore } from '../../../shared/store/authStore';
import { saveTokens } from '../../../shared/services/keychain/tokenStorage';
import { getCurrentUser, login, loginWithGoogle, register, type AuthCredentials } from '../api/authApi';

import type { TokenResponse } from '@prezio/shared-types';

// login/register/loginWithGoogle only return tokens (see authApi.ts) — fetch
// the user separately via GET /users/me before completing the session.
async function persistSession(tokens: TokenResponse) {
  const sessionTokens = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  await saveTokens(sessionTokens);
  const user = await getCurrentUser();
  useAuthStore.getState().setSession({ user, tokens: sessionTokens });
}

export function useLoginMutation() {
  return useMutation<TokenResponse, Error, AuthCredentials>({
    mutationFn: login,
    onSuccess: persistSession,
  });
}

export function useRegisterMutation() {
  return useMutation<TokenResponse, Error, AuthCredentials>({
    mutationFn: register,
    onSuccess: persistSession,
  });
}

export function useGoogleLoginMutation() {
  return useMutation<TokenResponse, Error, string>({
    mutationFn: loginWithGoogle,
    onSuccess: persistSession,
  });
}
