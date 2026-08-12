import { create } from 'zustand';

import type { User } from '@prezio/shared-types';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

/**
 * Internal (camelCase) token shape used at the store/keychain boundary — NOT
 * the wire format. The backend's `TokenResponse` (see @prezio/shared-types)
 * is snake_case; callers map it to this shape before calling setSession.
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (session: { user: User | null; tokens: SessionTokens }) => void;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
  finishBootstrap: (session: { user: User | null; tokens: SessionTokens } | null) => void;
}

/**
 * UI-facing auth state. The source of truth for the *tokens themselves* is
 * the OS keychain (see shared/services/keychain/tokenStorage.ts); this store
 * only mirrors the current access token in memory for fast reads by the
 * ky http client and marks whether the user is logged in.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  refreshToken: null,

  setSession: ({ user, tokens }) =>
    set({
      status: 'authenticated',
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }),

  setAccessToken: (accessToken) => set({ accessToken }),

  clearSession: () =>
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
    }),

  finishBootstrap: (session) =>
    set(
      session
        ? {
            status: 'authenticated',
            user: session.user,
            accessToken: session.tokens.accessToken,
            refreshToken: session.tokens.refreshToken,
          }
        : { status: 'unauthenticated' },
    ),
}));
