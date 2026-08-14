import { Chip } from '@mui/material';

import type { Availability } from '@prezio/shared-types';

const LABELS: Record<Availability, string> = {
  in_stock: 'EN STOCK',
  out_of_stock: 'AGOTADO',
  unknown: 'DESCONOCIDO',
  discontinued: 'DESCONTINUADO',
};

const COLORS: Record<Availability, 'success' | 'error' | 'default' | 'warning'> = {
  in_stock: 'success',
  out_of_stock: 'error',
  unknown: 'default',
  discontinued: 'warning',
};

export function AvailabilityChip({ availability }: { availability: Availability }) {
  return <Chip size="small" label={LABELS[availability]} color={COLORS[availability]} variant="outlined" />;
}
