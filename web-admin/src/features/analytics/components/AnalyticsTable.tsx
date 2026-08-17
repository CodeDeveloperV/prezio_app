import { Box, Stack, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

import type { GridColDef } from '@mui/x-data-grid';

export interface AnalyticsTableProps<T extends { id: number | string }> {
  columns: GridColDef<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  height?: number;
}

/** Thin DataGrid wrapper shared by all read-only analytics tables (no pagination server round-trip --
 * analytics rows are pre-aggregated and already small). */
export function AnalyticsTable<T extends { id: number | string }>({
  columns,
  rows,
  loading,
  emptyMessage = 'No hay datos para el rango y filtros seleccionados.',
  height = 320,
}: AnalyticsTableProps<T>) {
  return (
    <Box sx={{ height, backgroundColor: 'background.paper' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        density="compact"
        disableRowSelectionOnClick
        hideFooter={rows.length <= 10}
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
        slots={{
          noRowsOverlay: () => (
            <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary" variant="body2">
                {emptyMessage}
              </Typography>
            </Stack>
          ),
        }}
      />
    </Box>
  );
}
