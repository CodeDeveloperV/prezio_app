import { Paper, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { IconInfoCircle, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';

export interface KpiTrend {
  /** Percentage change vs the previous equivalent period; positive = increase. */
  changePercent: number;
  /** Whether an increase should be shown as a good (green) or bad (red) outcome. */
  positiveIsGood: boolean;
}

export interface KpiCardProps {
  label: string;
  value: number | string | null;
  loading?: boolean;
  helperText?: string;
  trend?: KpiTrend | null;
  color?: 'default' | 'warning' | 'error';
}

function formatTrend(trend: KpiTrend): { text: string; color: 'success.main' | 'error.main'; Icon: typeof IconTrendingUp } {
  const isIncrease = trend.changePercent >= 0;
  const isGoodOutcome = isIncrease === trend.positiveIsGood;
  return {
    text: `${isIncrease ? '+' : ''}${trend.changePercent.toFixed(1)}% vs período anterior`,
    color: isGoodOutcome ? 'success.main' : 'error.main',
    Icon: isIncrease ? IconTrendingUp : IconTrendingDown,
  };
}

/** Single headline metric for `/dashboard`. Value/trend come straight from the backend --
 * this component never computes or invents a metric itself. */
export function KpiCard({ label, value, loading, helperText, trend, color = 'default' }: KpiCardProps) {
  const trendInfo = trend ? formatTrend(trend) : null;

  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 180, flex: 1 }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        {helperText && (
          <Tooltip title={helperText}>
            <IconInfoCircle size={14} style={{ opacity: 0.6, cursor: 'help' }} />
          </Tooltip>
        )}
      </Stack>
      {loading ? (
        <Skeleton width={64} height={40} />
      ) : (
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: color === 'error' ? 'error.main' : color === 'warning' ? 'warning.main' : 'text.primary',
          }}
        >
          {value ?? '—'}
        </Typography>
      )}
      {trendInfo && !loading && (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <trendInfo.Icon size={14} color={trendInfo.color === 'success.main' ? '#2e7d32' : '#d32f2f'} />
          <Typography variant="caption" sx={{ color: trendInfo.color }}>
            {trendInfo.text}
          </Typography>
        </Stack>
      )}
    </Paper>
  );
}
