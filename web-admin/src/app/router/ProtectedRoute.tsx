import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/shared/store/authStore';
import { NoOrganizationAccess } from '@/features/auth/screens/NoOrganizationAccess';

export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);
  const memberships = useAuthStore((state) => state.memberships);
  const location = useLocation();

  if (status === 'bootstrapping') {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const hasActiveMembership = memberships.some((m) => m.status === 'active');
  if (!hasActiveMembership) {
    return <NoOrganizationAccess />;
  }

  return <Outlet />;
}
