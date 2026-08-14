import { useCallback } from 'react';

import { useAuthStore } from '@/shared/store/authStore';
import { clearTokens } from '@/shared/services/storage/tokenStorage';
import { logout } from '../api/authApi';

export function useLogout() {
  return useCallback(async () => {
    const { refreshToken } = useAuthStore.getState();

    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        // Best-effort: even if the backend call fails, wipe the local session.
      }
    }

    clearTokens();
    useAuthStore.getState().clearSession();
  }, []);
}
