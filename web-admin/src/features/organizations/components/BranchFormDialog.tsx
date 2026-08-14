import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { StoreBranch } from '@prezio/shared-types';

const branchSchema = z.object({
  name: z.string().min(1, 'Ingresa un nombre'),
  city: z.string().min(1, 'Ingresa una ciudad'),
});

type BranchFormValues = z.infer<typeof branchSchema>;

interface BranchFormDialogProps {
  open: boolean;
  branch: StoreBranch | null;
  onClose: () => void;
  onSubmit: (values: BranchFormValues) => void;
  isSubmitting: boolean;
  error: string | null;
}

export function BranchFormDialog({ open, branch, onClose, onSubmit, isSubmitting, error }: BranchFormDialogProps) {
  const { control, handleSubmit, reset } = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    values: { name: branch?.name ?? '', city: branch?.city ?? '' },
  });

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
      <DialogTitle>{branch ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
      <DialogContent>
        <Stack component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submit} noValidate>
          {error && <Alert severity="error">{error}</Alert>}
          <Controller
            name="name"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Nombre"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                fullWidth
                autoFocus
              />
            )}
          />
          <Controller
            name="city"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Ciudad"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                fullWidth
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={isSubmitting}>
          {branch ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
