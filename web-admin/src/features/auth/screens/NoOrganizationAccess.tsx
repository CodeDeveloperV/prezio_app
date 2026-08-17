import { Box, Button, Paper, Stack, Typography } from '@mui/material';

import { useLogout } from '../hooks/useLogout';

/** Shown when an authenticated user has no active organization membership --
 * this portal is exclusively for staff invited into a Prezio B2B organization. */
export function NoOrganizationAccess() {
  const logout = useLogout();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <Paper elevation={2} sx={{ p: 4, width: 420 }}>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Sin acceso a una organización
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Tu cuenta no tiene una membresía activa en ninguna organización de Prezio Business.
            Solicita a un administrador que te invite.
          </Typography>
          <Button variant="outlined" onClick={logout} sx={{ alignSelf: 'flex-start' }}>
            Cerrar sesión
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
