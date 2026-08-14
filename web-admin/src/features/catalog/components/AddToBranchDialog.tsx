import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { StoreBranch } from '@prezio/shared-types';

const addToBranchSchema = z.object({
  branch_ids: z.array(z.number()).min(1, 'Selecciona al menos una sucursal'),
  initial_price: z
    .string()
    .min(1, 'Ingresa un precio')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, 'Ingresa un precio válido'),
  currency: z.string().min(1),
});

export type AddToBranchFormValues = z.infer<typeof addToBranchSchema>;

interface AddToBranchDialogProps {
  open: boolean;
  branches: StoreBranch[];
  preselectedBranchId?: number;
  onClose: () => void;
  onSubmit: (values: AddToBranchFormValues) => void;
  isSubmitting: boolean;
  error: string | null;
}

export function AddToBranchDialog({
  open,
  branches,
  preselectedBranchId,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: AddToBranchDialogProps) {
  const { control, handleSubmit, reset } = useForm<AddToBranchFormValues>({
    resolver: zodResolver(addToBranchSchema),
    values: {
      branch_ids: preselectedBranchId ? [preselectedBranchId] : [],
      initial_price: '',
      currency: 'USD',
    },
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
      <DialogTitle>Agregar producto a sucursal</DialogTitle>
      <DialogContent>
        <Stack component="form" spacing={2} sx={{ pt: 1 }} onSubmit={submit} noValidate>
          {error && <Alert severity="error">{error}</Alert>}

          {branches.length === 0 ? (
            <Typography color="text.secondary">
              No hay sucursales disponibles para agregar este producto.
            </Typography>
          ) : (
            <Controller
              name="branch_ids"
              control={control}
              render={({ field, fieldState }) => (
                <Stack spacing={0.5}>
                  {branches.map((branch) => (
                    <FormControlLabel
                      key={branch.id}
                      control={
                        <Checkbox
                          checked={field.value.includes(branch.id)}
                          onChange={(e) => {
                            field.onChange(
                              e.target.checked
                                ? [...field.value, branch.id]
                                : field.value.filter((id) => id !== branch.id),
                            );
                          }}
                        />
                      }
                      label={`${branch.name} — ${branch.city}`}
                    />
                  ))}
                  {fieldState.error && (
                    <Typography variant="caption" color="error">
                      {fieldState.error.message}
                    </Typography>
                  )}
                </Stack>
              )}
            />
          )}

          <Controller
            name="initial_price"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Precio inicial"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                fullWidth
              />
            )}
          />
          <Controller
            name="currency"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Moneda"
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
        <Button variant="contained" onClick={submit} disabled={isSubmitting || branches.length === 0}>
          Agregar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
