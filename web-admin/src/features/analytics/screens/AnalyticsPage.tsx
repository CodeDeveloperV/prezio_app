import { Alert, Box, Divider, Grid, Stack, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useState } from 'react';

import { useActiveMembership } from '@/shared/store/authStore';
import { BranchFilter } from '../components/BranchFilter';
import { ChartCard } from '../components/ChartCard';
import { AnalyticsTable } from '../components/AnalyticsTable';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { KpiCard } from '../components/KpiCard';
import { LIFECYCLE_COUNT_LABELS, resolvePresetRange } from '../constants';
import {
  useAvailabilityAnalytics,
  useCouponsAnalytics,
  usePricingAnalytics,
  usePromotionsAnalytics,
  useReportsAnalytics,
} from '../hooks/useAnalytics';
import { useScopedBranches } from '../hooks/useScopedBranches';

import type { DateRange, DateRangePreset } from '../constants';
import type { GridColDef } from '@mui/x-data-grid';
import type { BranchCountRead, TopPriceChangeProductRead, TypeCountRead } from '@prezio/shared-types';

function lifecycleSeries(counts: { active: number; scheduled: number; expired: number; cancelled: number }) {
  return (['active', 'scheduled', 'expired', 'cancelled'] as const).map((key) => ({
    key,
    label: LIFECYCLE_COUNT_LABELS[key],
    value: counts[key],
  }));
}

export function AnalyticsPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const canViewAnalytics = activeMembership?.role === 'organization_admin' || activeMembership?.role === 'manager';

  const [preset, setPreset] = useState<DateRangePreset>('last_30_days');
  const [range, setRange] = useState<DateRange>(() => resolvePresetRange('last_30_days', { from: new Date(), to: new Date() }));
  const [branchIds, setBranchIds] = useState<number[]>([]);

  const { branches } = useScopedBranches(storeId);
  const rangeFilters = { date_from: range.from.toISOString(), date_to: range.to.toISOString(), branch_ids: branchIds };

  const pricingQuery = usePricingAnalytics(canViewAnalytics ? storeId : null, rangeFilters);
  const availabilityQuery = useAvailabilityAnalytics(canViewAnalytics ? storeId : null, branchIds);
  const promotionsQuery = usePromotionsAnalytics(canViewAnalytics ? storeId : null, branchIds);
  const couponsQuery = useCouponsAnalytics(canViewAnalytics ? storeId : null, branchIds);
  const reportsQuery = useReportsAnalytics(canViewAnalytics ? storeId : null, rangeFilters);

  const pricing = pricingQuery.data;
  const availability = availabilityQuery.data;
  const promotions = promotionsQuery.data;
  const coupons = couponsQuery.data;
  const reports = reportsQuery.data;

  const topProductsColumns: GridColDef<TopPriceChangeProductRead & { id: number }>[] = [
    { field: 'product_name', headerName: 'Producto', flex: 1.2 },
    { field: 'branch_name', headerName: 'Sucursal', flex: 1 },
    { field: 'changes_count', headerName: 'Cambios', width: 100 },
    { field: 'current_price', headerName: 'Precio actual', width: 130, valueGetter: (_, row) => `$${row.current_price}` },
    {
      field: 'last_updated',
      headerName: 'Última actualización',
      flex: 1,
      valueGetter: (_, row) => new Date(row.last_updated).toLocaleString(),
    },
  ];

  const branchCountColumns: GridColDef<BranchCountRead & { id: number }>[] = [
    { field: 'branch_name', headerName: 'Sucursal', flex: 1 },
    { field: 'count', headerName: 'Cantidad', flex: 1 },
  ];

  const typeCountColumns: GridColDef<TypeCountRead & { id: number }>[] = [
    { field: 'type', headerName: 'Tipo', flex: 1 },
    { field: 'count', headerName: 'Cantidad', flex: 1 },
  ];

  if (!canViewAnalytics) {
    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          Analítica
        </Typography>
        <Alert severity="info">Solo administradores y gerentes de la organización pueden ver la analítica.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Analítica
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <DateRangeFilter preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
        <BranchFilter branches={branches} value={branchIds} onChange={setBranchIds} />
      </Stack>

      {/* Pricing */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Precios
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <ChartCard
            title="Cambios de precio en el tiempo"
            loading={pricingQuery.isLoading}
            isEmpty={(pricing?.time_series.length ?? 0) === 0}
          >
            <BarChart
              height={280}
              xAxis={[{ scaleType: 'band', data: (pricing?.time_series ?? []).map((p) => new Date(p.bucket_start).toLocaleDateString()) }]}
              series={[
                { data: (pricing?.time_series ?? []).map((p) => p.increases_count), label: 'Aumentos', color: '#2e7d32' },
                { data: (pricing?.time_series ?? []).map((p) => p.decreases_count), label: 'Reducciones', color: '#d32f2f' },
              ]}
            />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2}>
            <KpiCard label="Aumentos" value={pricing?.increases_count ?? null} loading={pricingQuery.isLoading} />
            <KpiCard label="Reducciones" value={pricing?.decreases_count ?? null} loading={pricingQuery.isLoading} />
            <KpiCard
              label="Variación promedio"
              value={pricing?.avg_change_percent !== undefined && pricing?.avg_change_percent !== null ? `${pricing.avg_change_percent.toFixed(1)}%` : null}
              loading={pricingQuery.isLoading}
              helperText="Promedio de (precio nuevo - precio anterior) / precio anterior, sobre los cambios del período."
            />
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Productos con más cambios de precio"
            loading={pricingQuery.isLoading}
            isEmpty={(pricing?.top_products.length ?? 0) === 0}
          >
            <AnalyticsTable
              columns={topProductsColumns}
              rows={(pricing?.top_products ?? []).map((p, i) => ({ ...p, id: i }))}
            />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Precios por verificar por sucursal"
            loading={pricingQuery.isLoading}
            isEmpty={(pricing?.stale_prices_by_branch.length ?? 0) === 0}
            helperText="Precios cuya última verificación supera el umbral de vigencia configurado."
          >
            <BarChart
              height={280}
              layout="horizontal"
              yAxis={[{ scaleType: 'band', data: (pricing?.stale_prices_by_branch ?? []).map((b) => b.branch_name) }]}
              series={[{ data: (pricing?.stale_prices_by_branch ?? []).map((b) => b.count), label: 'Precios por verificar' }]}
            />
          </ChartCard>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Availability */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Disponibilidad
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <ChartCard title="Disponibilidad de productos listados" loading={availabilityQuery.isLoading} isEmpty={!availability}>
            <PieChart
              height={240}
              series={[
                {
                  data: [
                    { id: 'in_stock', value: availability?.in_stock ?? 0, label: 'En stock', color: '#2e7d32' },
                    { id: 'out_of_stock', value: availability?.out_of_stock ?? 0, label: 'Sin stock', color: '#d32f2f' },
                    { id: 'unknown', value: availability?.unknown ?? 0, label: 'Desconocido', color: '#9e9e9e' },
                  ],
                },
              ]}
            />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <ChartCard
            title="Disponibilidad por sucursal"
            loading={availabilityQuery.isLoading}
            isEmpty={(availability?.by_branch.length ?? 0) === 0}
          >
            <AnalyticsTable
              columns={[
                { field: 'branch_name', headerName: 'Sucursal', flex: 1 },
                { field: 'in_stock', headerName: 'En stock', flex: 1 },
                { field: 'out_of_stock', headerName: 'Sin stock', flex: 1 },
                { field: 'unknown', headerName: 'Desconocido', flex: 1 },
              ]}
              rows={(availability?.by_branch ?? []).map((b) => ({ ...b, id: b.branch_id }))}
            />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <ChartCard
            title="Productos listados por categoría"
            loading={availabilityQuery.isLoading}
            isEmpty={(availability?.active_listings_by_category.length ?? 0) === 0}
          >
            <BarChart
              height={280}
              xAxis={[{ scaleType: 'band', data: (availability?.active_listings_by_category ?? []).map((c) => c.category_name) }]}
              series={[{ data: (availability?.active_listings_by_category ?? []).map((c) => c.count), label: 'Productos listados' }]}
            />
          </ChartCard>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Promotions */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Promociones
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {promotions &&
          lifecycleSeries(promotions.counts).map((item) => (
            <Grid size={{ xs: 6, sm: 3 }} key={item.key}>
              <KpiCard label={item.label} value={item.value} loading={promotionsQuery.isLoading} />
            </Grid>
          ))}
        <Grid size={{ xs: 12, sm: 6 }}>
          <ChartCard title="Promociones por sucursal" loading={promotionsQuery.isLoading} isEmpty={(promotions?.by_branch.length ?? 0) === 0}>
            <AnalyticsTable columns={branchCountColumns} rows={(promotions?.by_branch ?? []).map((b) => ({ ...b, id: b.branch_id }))} />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <ChartCard title="Promociones por tipo" loading={promotionsQuery.isLoading} isEmpty={(promotions?.by_type.length ?? 0) === 0}>
            <AnalyticsTable columns={typeCountColumns} rows={(promotions?.by_type ?? []).map((t, i) => ({ ...t, id: i }))} />
          </ChartCard>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Coupons */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Cupones
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {coupons &&
          lifecycleSeries(coupons.counts).map((item) => (
            <Grid size={{ xs: 6, sm: 3 }} key={item.key}>
              <KpiCard label={item.label} value={item.value} loading={couponsQuery.isLoading} />
            </Grid>
          ))}
        <Grid size={{ xs: 12, sm: 6 }}>
          <ChartCard title="Cupones por tipo" loading={couponsQuery.isLoading} isEmpty={(coupons?.by_type.length ?? 0) === 0}>
            <AnalyticsTable columns={typeCountColumns} rows={(coupons?.by_type ?? []).map((t, i) => ({ ...t, id: i }))} />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <ChartCard title="Cupones por sucursal" loading={couponsQuery.isLoading} isEmpty={(coupons?.by_branch.length ?? 0) === 0}>
            <AnalyticsTable columns={branchCountColumns} rows={(coupons?.by_branch ?? []).map((b) => ({ ...b, id: b.branch_id }))} />
          </ChartCard>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Reports */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Reportes
      </Typography>
      {reportsQuery.isError && <Alert severity="error" sx={{ mb: 2 }}>No se pudo cargar la analítica de reportes.</Alert>}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Abiertos" value={reports?.open_count ?? null} loading={reportsQuery.isLoading} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="En revisión" value={reports?.in_review_count ?? null} loading={reportsQuery.isLoading} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Resueltos" value={reports?.resolved_count ?? null} loading={reportsQuery.isLoading}
            trend={reports && reports.resolved_previous_period_count !== null
              ? { changePercent: reports.resolved_previous_period_count === 0 ? 0 : ((reports.resolved_count - reports.resolved_previous_period_count) / reports.resolved_previous_period_count) * 100, positiveIsGood: true }
              : null}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <KpiCard label="Descartados" value={reports?.dismissed_count ?? null} loading={reportsQuery.isLoading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KpiCard
            label="Tiempo promedio de resolución"
            value={reports?.avg_resolution_hours !== undefined && reports?.avg_resolution_hours !== null ? `${reports.avg_resolution_hours.toFixed(1)} h` : null}
            loading={reportsQuery.isLoading}
            helperText="Promedio de horas entre creación y resolución, solo para reportes resueltos."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <ChartCard title="Reportes por tipo" loading={reportsQuery.isLoading} isEmpty={(reports?.by_type.length ?? 0) === 0}>
            <AnalyticsTable columns={typeCountColumns} rows={(reports?.by_type ?? []).map((t, i) => ({ ...t, id: i }))} height={220} />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <ChartCard title="Reportes por sucursal" loading={reportsQuery.isLoading} isEmpty={(reports?.by_branch.length ?? 0) === 0}>
            <AnalyticsTable columns={branchCountColumns} rows={(reports?.by_branch ?? []).map((b) => ({ ...b, id: b.branch_id }))} height={220} />
          </ChartCard>
        </Grid>
      </Grid>
    </Box>
  );
}
