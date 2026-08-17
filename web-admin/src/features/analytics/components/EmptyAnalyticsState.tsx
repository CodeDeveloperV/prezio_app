import { Stack, Typography } from '@mui/material';
import { IconChartBar } from '@tabler/icons-react';

export function EmptyAnalyticsState({ message = 'No hay datos para el rango y filtros seleccionados.' }: { message?: string }) {
  return (
    <Stack sx={{ height: 200, alignItems: 'center', justifyContent: 'center' }} spacing={1}>
      <IconChartBar size={32} style={{ opacity: 0.4 }} />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Stack>
  );
}
