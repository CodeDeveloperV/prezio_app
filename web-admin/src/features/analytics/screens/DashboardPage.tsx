import { Alert, Box, Grid, Paper, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { useActiveMembership } from '@/shared/store/authStore';
import { BranchFilter } from '../components/BranchFilter';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { EmptyAnalyticsState } from '../components/EmptyAnalyticsState';
import { KpiCard } from '../components/KpiCard';
import { resolvePresetRange } from '../constants';
import { useActivityFeed, useOverview } from '../hooks/useAnalytics';
import { useScopedBranches } from '../hooks/useScopedBranches';

import type { DateRange, DateRangePreset } from '../constants';
import type { KpiTrend } from '../components/KpiCard';

function percentChange(current: number, previous: number | null): KpiTrend | null {
  if (previous === null || previous === 0) return null;
  return { changePercent: ((current - previous) / previous) * 100, positiveIsGood: false };
}

export function DashboardPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isEmployee = activeMembership?.role === 'employee';

  const [preset, setPreset] = useState<DateRangePreset>(isEmployee ? 'today' : 'last_30_days');
  const [range, setRange] = useState<DateRange>(() => resolvePresetRange(isEmployee ? 'today' : 'last_30_days', { from: new Date(), to: new Date() }));
  const [branchIds, setBranchIds] = useState<number[]>([]);

  const { branches } = useScopedBranches(storeId);

  const filters = { date_from: range.from.toISOString(), date_to: range.to.toISOString(), branch_ids: branchIds };
  const overviewQuery = useOverview(storeId, filters);
  const activityQuery = useActivityFeed(storeId, filters, 20);
  const overview = overviewQuery.data;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Dashboard
      </Typography>

      {isEmployee && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Vista operativa: precios actualizados hoy, precios por verificar, sin existencias y reportes abiertos.
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }} alignItems="center">
        {!isEmployee && <DateRangeFilter preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />}
        <BranchFilter branches={branches} value={branchIds} onChange={setBranchIds} />
      </Stack>

      {overviewQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          No se pudo cargar el resumen del dashboard.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {!isEmployee && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard label="Productos listados" value={overview?.active_listings ?? null} loading={overviewQuery.isLoading} />
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            label={preset === 'today' ? 'Precio actualizado hoy' : 'Precios actualizados'}
            value={overview?.prices_updated ?? null}
            loading={overviewQuery.isLoading}
            trend={overview ? percentChange(overview.prices_updated, overview.prices_updated_previous_period) : null}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            label="Precios por verificar"
            value={overview?.stale_prices ?? null}
            loading={overviewQuery.isLoading}
            color={overview && overview.stale_prices > 0 ? 'warning' : 'default'}
            helperText="Precios cuya última verificación supera el umbral de vigencia configurado."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            label="Reportes abiertos"
            value={overview?.open_reports ?? null}
            loading={overviewQuery.isLoading}
            helperText={overview ? `${overview.high_priority_open_reports} de alta prioridad` : undefined}
            color={overview && overview.high_priority_open_reports > 0 ? 'error' : 'default'}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="Sin existencias" value={overview?.out_of_stock ?? null} loading={overviewQuery.isLoading} />
        </Grid>
        {!isEmployee && (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard label="Promociones activas" value={overview?.active_promotions ?? null} loading={overviewQuery.isLoading} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard label="Cupones activos" value={overview?.active_coupons ?? null} loading={overviewQuery.isLoading} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard label="Sucursales activas" value={overview?.active_branches ?? null} loading={overviewQuery.isLoading} />
            </Grid>
          </>
        )}
      </Grid>

      {!isEmployee && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Actividad reciente
          </Typography>
          {activityQuery.isLoading ? (
            <Typography variant="body2" color="text.secondary">
              Cargando…
            </Typography>
          ) : (activityQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyAnalyticsState message="No hay actividad registrada en este rango." />
          ) : (
            <Stack spacing={1}>
              {activityQuery.data?.items.map((item, index) => (
                <Stack key={index} direction="row" justifyContent="space-between" sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 }}>
                  <Typography variant="body2">
                    {item.description}
                    {item.branch_name ? ` · ${item.branch_name}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(item.occurred_at).toLocaleString()}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>
      )}
    </Box>
  );
}
