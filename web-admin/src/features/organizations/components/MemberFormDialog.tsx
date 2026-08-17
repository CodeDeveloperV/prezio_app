import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { ROLE_LABELS } from '../constants';

import type { OrganizationMemberRead, OrganizationRole, StoreBranch } from '@prezio/shared-types';

const memberSchema = z.object({
  email: z.string().email('Ingresa un correo válido'),
  role: z.enum(['organization_admin', 'manager', 'employee']),
  status: z.enum(['active', 'inactive']),
  branch_ids: z.array(z.number()),
});

export type MemberFormValues = z.infer<typeof memberSchema>;

interface MemberFormDialogProps {
  open: boolean;
  /** null = inviting a new member; otherwise editing this existing one. */
  member: OrganizationMemberRead | null;
  branches: StoreBranch[];
  onClose: () => void;
  onSubmit: (values: MemberFormValues) => void;
  isSubmitting: boolean;
  error: string | null;
}

const ROLE_OPTIONS: OrganizationRole[] = ['organization_admin', 'manager', 'employee'];

export function MemberFormDialog({
  open,
  member,
  branches,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: MemberFormDialogProps) {
  const isEditing = member !== null;

  const { control, handleSubmit, watch, reset } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    values: {
      email: member?.user_email ?? '',
      role: member?.role ?? 'employee',
      status: member?.status ?? 'active',
      branch_ids: member?.branch_ids ?? [],
    },
  });

  const role = watch('role');
  const submit = handleSubmit(onSubmit);

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{isEditing ? 'Editar miembro' : 'Invitar miembro'}</DialogTitle>
      <DialogContent>
        <Stack component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submit} noValidate>
          {error && <Alert severity="error">{error}</Alert>}

          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Correo"
                type="email"
                disabled={isEditing}
                error={!!fieldState.error}
                helperText={
                  fieldState.error?.message ?? (isEditing ? undefined : 'Debe tener una cuenta Prezio existente')
                }
                fullWidth
                autoFocus={!isEditing}
              />
            )}
          />

          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <TextField {...field} label="Rol" select fullWidth>
                {ROLE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {isEditing && (
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <TextField {...field} label="Estado" select fullWidth>
                  <MenuItem value="active">Activo</MenuItem>
                  <MenuItem value="inactive">Inactivo</MenuItem>
                </TextField>
              )}
            />
          )}

          {role === 'organization_admin' ? (
            <Typography variant="caption" color="text.secondary">
              Los administradores tienen acceso a todas las sucursales.
            </Typography>
          ) : (
            <Controller
              name="branch_ids"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  multiple
                  displayEmpty
                  fullWidth
                  renderValue={(selected) =>
                    selected.length === 0
                      ? 'Sin sucursales asignadas'
                      : branches
                          .filter((b) => selected.includes(b.id))
                          .map((b) => b.name)
                          .join(', ')
                  }
                >
                  {branches.map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>
                      <Checkbox checked={field.value.includes(branch.id)} />
                      <ListItemText primary={branch.name} />
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={isSubmitting}>
          {isEditing ? 'Guardar' : 'Invitar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
