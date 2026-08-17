import { Alert, Box, Checkbox, FormControlLabel, MenuItem, Paper, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useState } from 'react';

import { useBranches } from '@/features/organizations/hooks/useBranches';
import { useActiveMembership } from '@/shared/store/authStore';
import { ReportDetailDialog } from '../components/ReportDetailDialog';
import { ReportPriorityChip } from '../components/ReportPriorityChip';
import { ReportStatusChip } from '../components/ReportStatusChip';
import { REPORT_PRIORITY_LABELS, REPORT_PRIORITY_OPTIONS, REPORT_STATUS_LABELS, REPORT_STATUS_OPTIONS, REPORT_TYPE_LABELS, REPORT_TYPE_OPTIONS } from '../constants';
import { useReports, useReportsSummary } from '../hooks/useReports';

import type { ReportFilters } from '../api/reportsApi';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import type { ReportListItemRead, ReportPriority, ReportStatus, ReportType } from '@prezio/shared-types';

function scopeSummary(report: ReportListItemRead): string {
  if (report.product_name) return report.product_name;
  if (report.branch_name) return report.branch_name;
  return `#${report.id}`;
}

function priceSummary(report: ReportListItemRead): string {
  if (report.current_price === null && report.reported_price === null) return '—';
  return `${report.current_price ?? '—'} → ${report.reported_price ?? '—'}`;
}

export function ReportsPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isAdmin = activeMembership?.role === 'organization_admin';
  const isManager = activeMembership?.role === 'manager';
  // Spec section 10: EMPLOYEE is strictly read-only for this first version.
  const canOperate = isAdmin || isManager;

  const [filters, setFilters] = useState<Omit<ReportFilters, 'page' | 'page_size'>>({});
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const branchesQuery = useBranches(storeId);
  const summaryQuery = useReportsSummary(storeId);
  const reportsQuery = useReports(storeId, {
    ...filters,
    page: paginationModel.page + 1,
    page_size: paginationModel.pageSize,
  });

  const rows = reportsQuery.data?.items ?? [];
  const total = reportsQuery.data?.total ?? 0;
  const summary = summaryQuery.data;

  const columns: GridColDef<ReportListItemRead>[] = [
    { field: 'type', headerName: 'Tipo', flex: 1, valueGetter: (_, row) => REPORT_TYPE_LABELS[row.type] },
    {
      field: 'status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => <ReportStatusChip status={params.row.status} />,
    },
    {
      field: 'priority',
      headerName: 'Prioridad',
      width: 120,
      renderCell: (params) => <ReportPriorityChip priority={params.row.priority} />,
    },
    { field: 'scope', headerName: 'Elemento', flex: 1.1, valueGetter: (_, row) => scopeSummary(row) },
    { field: 'branch_name', headerName: 'Sucursal', flex: 0.8, valueGetter: (_, row) => row.branch_name ?? '—' },
    {
      field: 'price_change',
      headerName: 'Precio (actual → reportado)',
      flex: 1,
      valueGetter: (_, row) => priceSummary(row),
    },
    {
      field: 'group_report_count',
      headerName: 'Reportes',
      width: 100,
      valueGetter: (_, row) => row.group_report_count,
    },
    {
      field: 'latest_reported_at',
      headerName: 'Último reporte',
      flex: 0.9,
      valueGetter: (_, row) => new Date(row.latest_reported_at).toLocaleString(),
    },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Reportes
      </Typography>

      {!canOperate && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Solo puedes consultar los reportes de tu organización.
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">
            Abiertos
          </Typography>
          <Typography variant="h5">{summary?.open_count ?? '—'}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">
            En revisión
          </Typography>
          <Typography variant="h5">{summary?.in_review_count ?? '—'}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">
            Alta prioridad abiertos
          </Typography>
          <Typography variant="h5">{summary?.high_priority_open_count ?? '—'}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">
            Resueltos esta semana
          </Typography>
          <Typography variant="h5">{summary?.resolved_this_week_count ?? '—'}</Typography>
        </Paper>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Tipo"
          size="small"
          select
          sx={{ minWidth: 200 }}
          value={filters.type ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, type: (e.target.value || undefined) as ReportType | undefined }))}
        >
          <MenuItem value="">Todos</MenuItem>
          {REPORT_TYPE_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {REPORT_TYPE_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Estado"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.status_filter ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status_filter: (e.target.value || undefined) as ReportStatus | undefined }))
          }
        >
          <MenuItem value="">Todos</MenuItem>
          {REPORT_STATUS_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {REPORT_STATUS_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Prioridad"
          size="small"
          select
          sx={{ minWidth: 140 }}
          value={filters.priority ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, priority: (e.target.value || undefined) as ReportPriority | undefined }))
          }
        >
          <MenuItem value="">Todas</MenuItem>
          {REPORT_PRIORITY_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {REPORT_PRIORITY_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Sucursal"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.branch_id ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : undefined }))}
        >
          <MenuItem value="">Todas</MenuItem>
          {(branchesQuery.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={filters.only_open ?? false}
              onChange={(e) => setFilters((f) => ({ ...f, only_open: e.target.checked || undefined }))}
            />
          }
          label="Solo abiertos"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={filters.unassigned ?? false}
              onChange={(e) => setFilters((f) => ({ ...f, unassigned: e.target.checked || undefined }))}
            />
          }
          label="Sin asignar"
        />
      </Stack>

      {reportsQuery.isError && <Alert severity="error" sx={{ mb: 2 }}>No se pudo cargar la lista de reportes.</Alert>}

      <Box sx={{ backgroundColor: 'background.paper' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={reportsQuery.isLoading}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={(params) => setSelectedReportId(params.row.id)}
          sx={{ cursor: 'pointer' }}
          paginationMode="server"
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[20, 50, 100]}
          slots={{
            noRowsOverlay: () => (
              <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No hay reportes con estos filtros.</Typography>
              </Stack>
            ),
          }}
        />
      </Box>

      <ReportDetailDialog
        storeId={storeId}
        reportId={selectedReportId}
        canOperate={canOperate}
        onClose={() => setSelectedReportId(null)}
        onActionSuccess={(message) => setToast(message)}
      />

      <Snackbar open={toast !== null} autoHideDuration={3000} onClose={() => setToast(null)} message={toast ?? ''} />
    </Box>
  );
}
