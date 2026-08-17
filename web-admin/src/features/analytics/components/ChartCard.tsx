import { Paper, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { IconInfoCircle } from '@tabler/icons-react';

import { EmptyAnalyticsState } from './EmptyAnalyticsState';

import type { ReactNode } from 'react';

export interface ChartCardProps {
  title: string;
  helperText?: string;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  children: ReactNode;
}

/** Standard chrome (title, tooltip, loading/empty states) around any @mui/x-charts chart or table. */
export function ChartCard({ title, helperText, loading, isEmpty, emptyMessage, height = 280, children }: ChartCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" spacing={0.5} sx={{ mb: 1, alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {helperText && (
          <Tooltip title={helperText}>
            <IconInfoCircle size={14} style={{ opacity: 0.6, cursor: 'help' }} />
          </Tooltip>
        )}
      </Stack>
      {loading ? (
        <Skeleton variant="rounded" width="100%" height={height} />
      ) : isEmpty ? (
        <EmptyAnalyticsState message={emptyMessage} />
      ) : (
        children
      )}
    </Paper>
  );
}
