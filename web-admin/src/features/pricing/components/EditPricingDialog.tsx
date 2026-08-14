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
import { useEffect, useState } from 'react';

import { PriceConflictError } from '../api/pricingApi';
import { useUpdatePricing } from '../hooks/usePricingMutations';

import type {
  Availability,
  B2BPriceConflictRead,
  PricingAvailabilityChoice,
  PricingListItemRead,
} from '@prezio/shared-types';

const AVAILABILITY_OPTIONS: { value: PricingAvailabilityChoice; label: string }[] = [
  { value: 'in_stock', label: 'En stock' },
  { value: 'out_of_stock', label: 'Agotado' },
  { value: 'unknown', label: 'Desconocido' },
];

const AVAILABILITY_LABELS: Record<Availability, string> = {
  in_stock: 'En stock',
  out_of_stock: 'Agotado',
  unknown: 'Desconocido',
  discontinued: 'Descontinuado',
};

interface EditPricingDialogProps {
  storeId: number | null;
  item: PricingListItemRead | null;
  onClose: () => void;
}

export function EditPricingDialog({ storeId, item, onClose }: EditPricingDialogProps) {
  const updatePricing = useUpdatePricing(storeId);

  const [price, setPrice] = useState('');
  const [availability, setAvailability] = useState<PricingAvailabilityChoice>('in_stock');
  const [version, setVersion] = useState(0);
  const [conflict, setConflict] = useState<B2BPriceConflictRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setPrice(String(item.current_price));
      setAvailability(item.availability === 'discontinued' ? 'unknown' : item.availability);
      setVersion(item.version);
      setConflict(null);
      setError(null);
    }
  }, [item]);

  if (!item) {
    return null;
  }

  const handleSave = () => {
    setError(null);
    updatePricing
      .mutateAsync({
        storeProductId: item.store_product_id,
        payload: { price, availability, version },
      })
      .then(() => onClose())
      .catch((err: unknown) => {
        if (err instanceof PriceConflictError) {
          setConflict(err.conflict);
          return;
        }
        setError('No se pudo actualizar el precio.');
      });
  };

  const handleUseCurrent = () => {
    if (!conflict) return;
    setPrice(String(conflict.current_price));
    if (conflict.current_availability && conflict.current_availability !== 'discontinued') {
      setAvailability(conflict.current_availability);
    }
    setVersion(conflict.current_version);
    setConflict(null);
  };

  const handleKeepEditing = () => {
    if (!conflict) return;
    setVersion(conflict.current_version);
    setConflict(null);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar precio — {item.canonical_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {conflict && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={handleKeepEditing}>
                    Volver a editar
                  </Button>
                  <Button size="small" variant="contained" onClick={handleUseCurrent}>
                    Usar precio actual
                  </Button>
                </Stack>
              }
            >
              El precio fue actualizado por otro usuario. Precio actual: {item.currency} {conflict.current_price}
              {conflict.current_availability ? ` · ${AVAILABILITY_LABELS[conflict.current_availability]}` : ''}
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={`Precio (${item.currency})`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            fullWidth
          />

          <TextField label="Disponibilidad" select value={availability} onChange={(e) => setAvailability(e.target.value as PricingAvailabilityChoice)} fullWidth>
            {AVAILABILITY_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          <Typography variant="caption" color="text.secondary">
            Sucursal: {item.branch_name}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={updatePricing.isPending}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
