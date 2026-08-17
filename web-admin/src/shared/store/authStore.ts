import { create } from 'zustand';

import type { MyMembershipRead, User } from '@prezio/shared-types';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

/**
 * Internal (camelCase) token shape used at the store/storage boundary -- NOT
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
  memberships: MyMembershipRead[];
  activeOrganizationId: number | null;
  setSession: (session: { user: User | null; tokens: SessionTokens }) => void;
  setAccessToken: (accessToken: string) => void;
  setMemberships: (memberships: MyMembershipRead[]) => void;
  setActiveOrganizationId: (organizationId: number) => void;
  clearSession: () => void;
  finishBootstrap: (
    session: { user: User | null; tokens: SessionTokens; memberships: MyMembershipRead[] } | null,
  ) => void;
}

function pickDefaultOrganizationId(memberships: MyMembershipRead[]): number | null {
  return memberships.find((m) => m.status === 'active')?.organization.id ?? null;
}

/**
 * UI-facing auth state. The source of truth for the tokens themselves is
 * localStorage (see shared/services/storage/tokenStorage.ts); this store
 * mirrors the current access token in memory for fast reads by the ky http
 * client and tracks which organization the portal is currently scoped to.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  refreshToken: null,
  memberships: [],
  activeOrganizationId: null,

  setSession: ({ user, tokens }) =>
    set({
      status: 'authenticated',
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }),

  setAccessToken: (accessToken) => set({ accessToken }),

  setMemberships: (memberships) =>
    set({
      memberships,
      activeOrganizationId: get().activeOrganizationId ?? pickDefaultOrganizationId(memberships),
    }),

  setActiveOrganizationId: (organizationId) => set({ activeOrganizationId: organizationId }),

  clearSession: () =>
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
      memberships: [],
      activeOrganizationId: null,
    }),

  finishBootstrap: (session) =>
    set(
      session
        ? {
            status: 'authenticated',
            user: session.user,
            accessToken: session.tokens.accessToken,
            refreshToken: session.tokens.refreshToken,
            memberships: session.memberships,
            activeOrganizationId: pickDefaultOrganizationId(session.memberships),
          }
        : { status: 'unauthenticated' },
    ),
}));

export function useActiveMembership(): MyMembershipRead | null {
  return useAuthStore(
    (state) => state.memberships.find((m) => m.organization.id === state.activeOrganizationId) ?? null,
  );
}
