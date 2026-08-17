import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useAuthStore } from '@/shared/store/authStore';
import { useLoginMutation } from '../hooks/useAuthMutations';

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const status = useAuthStore((state) => state.status);
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'authenticated') {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    loginMutation.mutate(values, {
      onSuccess: () => navigate('/', { replace: true }),
      onError: () => setFormError('Correo o contraseña incorrectos'),
    });
  });

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
      }}
    >
      <Paper elevation={2} sx={{ p: 4, width: 400 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Prezio Business
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Portal de administración para supermercados
            </Typography>
          </Box>

          {formError && <Alert severity="error">{formError}</Alert>}

          <Stack component="form" spacing={2} onSubmit={onSubmit} noValidate>
            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Correo"
                  type="email"
                  autoComplete="email"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                />
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Contraseña"
                  type="password"
                  autoComplete="current-password"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  fullWidth
                />
              )}
            />
            <Button type="submit" variant="contained" size="large" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
