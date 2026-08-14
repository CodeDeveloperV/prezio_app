import { Chip } from '@mui/material';

import type { PriceUpdateSource } from '@prezio/shared-types';

const LABELS: Record<PriceUpdateSource, string> = {
  community: 'COMUNIDAD',
  merchant: 'SUPERMERCADO',
  system: 'SISTEMA',
};

export function PriceSourceChip({ source }: { source: PriceUpdateSource | null }) {
  if (!source) {
    return <Chip size="small" label="—" variant="outlined" />;
  }
  return <Chip size="small" label={LABELS[source]} variant="outlined" />;
}
