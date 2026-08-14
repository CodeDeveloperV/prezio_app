import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { useBatchUpdatePricing } from '../hooks/usePricingMutations';

import type { B2BBatchUpdateResponse, PricingAvailabilityChoice, PricingListItemRead } from '@prezio/shared-types';

const AVAILABILITY_OPTIONS: { value: PricingAvailabilityChoice; label: string }[] = [
  { value: 'in_stock', label: 'En stock' },
  { value: 'out_of_stock', label: 'Agotado' },
  { value: 'unknown', label: 'Desconocido' },
];

interface BatchAvailabilityDialogProps {
  storeId: number | null;
  items: PricingListItemRead[];
  open: boolean;
  onClose: () => void;
}

export function BatchAvailabilityDialog({ storeId, items, open, onClose }: BatchAvailabilityDialogProps) {
  const batchUpdate = useBatchUpdatePricing(storeId);
  const [availability, setAvailability] = useState<PricingAvailabilityChoice>('out_of_stock');
  const [result, setResult] = useState<B2BBatchUpdateResponse | null>(null);

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  const handleApply = () => {
    setResult(null);
    batchUpdate
      .mutateAsync({
        items: items.map((item) => ({ store_product_id: item.store_product_id, availability, version: item.version })),
      })
      .then(setResult);
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Actualizar disponibilidad en lote ({items.length} productos)</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!result && (
            <TextField
              label="Nueva disponibilidad"
              select
              value={availability}
              onChange={(e) => setAvailability(e.target.value as PricingAvailabilityChoice)}
              fullWidth
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          {result && (
            <Stack spacing={1}>
              <Alert severity="success">{result.updated.length} actualizados correctamente.</Alert>
              {result.conflicts.length > 0 && (
                <Alert severity="warning">
                  {result.conflicts.length} tenían un cambio más reciente de otro usuario y no se aplicaron.
                </Alert>
              )}
              {result.failed.length > 0 && (
                <Alert severity="error">{result.failed.length} fallaron y no se aplicaron.</Alert>
              )}
              <Typography variant="caption" color="text.secondary">
                Revisa la lista para confirmar el estado final de cada producto.
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{result ? 'Cerrar' : 'Cancelar'}</Button>
        {!result && (
          <Button variant="contained" onClick={handleApply} disabled={batchUpdate.isPending || items.length === 0}>
            Aplicar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
