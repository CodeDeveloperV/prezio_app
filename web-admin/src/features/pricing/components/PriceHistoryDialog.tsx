import { Alert, Dialog, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

import { usePricingHistory } from '../hooks/usePricingHistory';
import { PriceSourceChip } from './PriceSourceChip';

import type { PricingListItemRead } from '@prezio/shared-types';

interface PriceHistoryDialogProps {
  storeId: number | null;
  item: PricingListItemRead | null;
  onClose: () => void;
}

export function PriceHistoryDialog({ storeId, item, onClose }: PriceHistoryDialogProps) {
  const historyQuery = usePricingHistory(storeId, item?.store_product_id ?? null);

  if (!item) {
    return null;
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Historial de precios — {item.canonical_name}</DialogTitle>
      <DialogContent>
        {historyQuery.isLoading && <Typography>Cargando...</Typography>}
        {historyQuery.isError && <Alert severity="error">No se pudo cargar el historial.</Alert>}

        <Stack spacing={1.5} sx={{ pb: 1 }}>
          {(historyQuery.data ?? []).map((entry) => (
            <Stack
              key={entry.id}
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}
            >
              <Stack>
                <Typography sx={{ fontWeight: 500 }}>
                  {item.currency} {entry.previous_price ?? '—'} → {item.currency} {entry.new_price}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(entry.updated_at).toLocaleString()} ·{' '}
                  {entry.updated_by?.display_name ?? entry.updated_by?.email ?? 'Sistema'}
                </Typography>
              </Stack>
              <PriceSourceChip source={entry.source} />
            </Stack>
          ))}
          {historyQuery.data?.length === 0 && (
            <Typography color="text.secondary">Sin historial de cambios registrado.</Typography>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
