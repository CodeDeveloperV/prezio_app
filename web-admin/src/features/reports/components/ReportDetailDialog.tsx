import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useMembers } from '@/features/organizations/hooks/useMembers';
import { ReportActionError } from '../api/reportsApi';
import {
  useAssignReport,
  useMarkReportInReview,
  useResolveReport,
  useDismissReport,
  useTakeReport,
  useUpdateReportPriority,
} from '../hooks/useReportMutations';
import { useReport } from '../hooks/useReports';
import { REPORT_PRIORITY_LABELS, REPORT_PRIORITY_OPTIONS, REPORT_RESOLUTION_TYPE_LABELS, REPORT_TYPE_LABELS } from '../constants';
import { ReportAssignDialog } from './ReportAssignDialog';
import { ReportPriorityChip } from './ReportPriorityChip';
import { ReportResolutionDialog } from './ReportResolutionDialog';
import { ReportStatusChip } from './ReportStatusChip';

import type { ReportListItemRead, ReportPriority, ReportResolutionType } from '@prezio/shared-types';

interface ReportDetailDialogProps {
  storeId: number | null;
  reportId: number | null;
  canOperate: boolean;
  onClose: () => void;
  onActionSuccess: (message: string) => void;
}

function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ValueBlock({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  if (!value) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      <Stack spacing={0.25}>
        {entries.map(([key, entryValue]) => (
          <Typography key={key} variant="body2">
            {key}: <strong>{formatSnapshotValue(entryValue)}</strong>
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

export function ReportDetailDialog({ storeId, reportId, canOperate, onClose, onActionSuccess }: ReportDetailDialogProps) {
  const reportQuery = useReport(storeId, reportId);
  const report = reportQuery.data ?? null;
  const membersQuery = useMembers(storeId, canOperate);

  const takeReport = useTakeReport(storeId);
  const markInReview = useMarkReportInReview(storeId);
  const assignReport = useAssignReport(storeId);
  const updatePriority = useUpdateReportPriority(storeId);
  const resolveReport = useResolveReport(storeId);
  const dismissReport = useDismissReport(storeId);

  const [assignOpen, setAssignOpen] = useState(false);
  const [resolutionDialog, setResolutionDialog] = useState<'resolve' | 'dismiss' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const navigate = useNavigate();

  const isOpen = reportId !== null;

  const handleError = (err: unknown) => {
    setActionError(err instanceof ReportActionError ? err.message : 'No se pudo completar la acción.');
  };

  const handleTake = () => {
    if (!reportId) return;
    setActionError(null);
    takeReport
      .mutateAsync(reportId)
      .then(() => onActionSuccess('Reporte tomado y marcado en revisión'))
      .catch(handleError);
  };

  const handleMarkInReview = () => {
    if (!reportId) return;
    setActionError(null);
    markInReview
      .mutateAsync(reportId)
      .then(() => onActionSuccess('Reporte marcado en revisión'))
      .catch(handleError);
  };

  const handleAssign = (assignedToUserId: number | null) => {
    if (!reportId) return;
    setActionError(null);
    assignReport
      .mutateAsync({ reportId, payload: { assigned_to_user_id: assignedToUserId } })
      .then(() => {
        setAssignOpen(false);
        onActionSuccess('Reporte asignado');
      })
      .catch(handleError);
  };

  const handlePriorityChange = (priority: ReportPriority) => {
    if (!reportId) return;
    setActionError(null);
    updatePriority
      .mutateAsync({ reportId, payload: { priority } })
      .then(() => onActionSuccess('Prioridad actualizada'))
      .catch(handleError);
  };

  const handleResolve = (resolutionType: ReportResolutionType, note: string | null) => {
    if (!reportId) return;
    setActionError(null);
    resolveReport
      .mutateAsync({ reportId, payload: { resolution_type: resolutionType, resolution_note: note } })
      .then(() => {
        setResolutionDialog(null);
        onActionSuccess('Reporte resuelto');
      })
      .catch(handleError);
  };

  const handleDismiss = (note: string | null) => {
    if (!reportId) return;
    setActionError(null);
    dismissReport
      .mutateAsync({ reportId, payload: { resolution_note: note } })
      .then(() => {
        setResolutionDialog(null);
        onActionSuccess('Reporte descartado');
      })
      .catch(handleError);
  };

  if (!isOpen) return null;

  const canTransition = canOperate && report && (report.status === 'open' || report.status === 'in_review');
  const canTake = canOperate && report?.status === 'open';

  const listItemForDialogs: ReportListItemRead | null = report
    ? {
        id: report.id,
        type: report.type,
        status: report.status,
        priority: report.priority,
        product_id: report.product_id,
        product_name: report.product_name,
        store_product_id: report.store_product_id,
        store_branch_id: report.store_branch_id,
        branch_name: report.branch_name,
        current_price: null,
        reported_price: null,
        assigned_to_user_id: report.assigned_to_user_id,
        group_report_count: report.group_report_count,
        latest_reported_at: report.latest_reported_at,
        created_at: report.created_at,
      }
    : null;

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Reporte #{reportId}</DialogTitle>
        <DialogContent>
          {reportQuery.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {reportQuery.isError && <Alert severity="error">No se pudo cargar el reporte.</Alert>}

          {report && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              {actionError && <Alert severity="error">{actionError}</Alert>}

              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <ReportStatusChip status={report.status} />
                <ReportPriorityChip priority={report.priority} />
              </Stack>

              <Box>
                <Typography variant="overline" color="text.secondary">
                  Tipo
                </Typography>
                <Typography>{REPORT_TYPE_LABELS[report.type]}</Typography>
              </Box>

              {report.group_report_count > 1 && (
                <Alert severity="info">
                  {report.group_report_count} usuarios reportaron este mismo elemento -- primer reporte el{' '}
                  {new Date(report.first_reported_at).toLocaleString()}, último el{' '}
                  {new Date(report.latest_reported_at).toLocaleString()}.
                </Alert>
              )}

              <Stack spacing={0.25}>
                {report.product_name && <Typography variant="body2">Producto: {report.product_name}</Typography>}
                {report.branch_name && <Typography variant="body2">Sucursal: {report.branch_name}</Typography>}
                {report.barcode && <Typography variant="body2">Barcode: {report.barcode}</Typography>}
              </Stack>

              {report.description && (
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Descripción
                  </Typography>
                  <Typography variant="body2">{report.description}</Typography>
                </Box>
              )}

              <ValueBlock title="Valor reportado" value={report.reported_value} />
              <ValueBlock title="Valor al momento del reporte" value={report.current_value_snapshot} />

              {(report.type === 'incorrect_price' || report.type === 'incorrect_availability') && report.store_product_id && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigate(report.barcode ? `/pricing?barcode=${encodeURIComponent(report.barcode)}` : '/pricing')}
                >
                  Ir a Precios a corregir
                </Button>
              )}
              {report.type === 'product_not_sold_here' && report.product_id && (
                <Button size="small" variant="outlined" onClick={() => navigate(`/catalog/products/${report.product_id}`)}>
                  Ir al Catálogo para desactivar el listado
                </Button>
              )}

              {report.resolution_type && (
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Resolución
                  </Typography>
                  <Typography variant="body2">{REPORT_RESOLUTION_TYPE_LABELS[report.resolution_type]}</Typography>
                  {report.resolution_note && <Typography variant="body2">{report.resolution_note}</Typography>}
                  {report.resolved_at && (
                    <Typography variant="caption" color="text.secondary">
                      Resuelto el {new Date(report.resolved_at).toLocaleString()}
                    </Typography>
                  )}
                  {report.dismissed_at && (
                    <Typography variant="caption" color="text.secondary">
                      Descartado el {new Date(report.dismissed_at).toLocaleString()}
                    </Typography>
                  )}
                </Box>
              )}

              {canOperate && (
                <>
                  <Divider />
                  <Typography variant="overline" color="text.secondary">
                    Prioridad
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {REPORT_PRIORITY_OPTIONS.map((option) => (
                      <Button
                        key={option}
                        size="small"
                        variant={report.priority === option ? 'contained' : 'outlined'}
                        onClick={() => handlePriorityChange(option)}
                        disabled={updatePriority.isPending || report.status === 'resolved' || report.status === 'dismissed'}
                      >
                        {REPORT_PRIORITY_LABELS[option]}
                      </Button>
                    ))}
                  </Stack>
                </>
              )}

              <Divider />
              <Typography variant="overline" color="text.secondary">
                Actividad
              </Typography>
              <Stack spacing={1}>
                {report.activities.map((activity) => (
                  <Box key={activity.id}>
                    <Typography variant="body2">{activity.action}</Typography>
                    {activity.note && (
                      <Typography variant="caption" color="text.secondary">
                        {activity.note}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {new Date(activity.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                ))}
                {report.activities.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Sin actividad registrada.
                  </Typography>
                )}
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
          {canTake && (
            <Button onClick={handleMarkInReview} disabled={markInReview.isPending}>
              Marcar en revisión
            </Button>
          )}
          {canTake && (
            <Button onClick={handleTake} disabled={takeReport.isPending}>
              Tomar
            </Button>
          )}
          {canOperate && (report?.status === 'open' || report?.status === 'in_review') && (
            <Button onClick={() => setAssignOpen(true)}>Asignar</Button>
          )}
          {canTransition && (
            <Button color="error" onClick={() => setResolutionDialog('dismiss')}>
              Descartar
            </Button>
          )}
          {canTransition && (
            <Button variant="contained" onClick={() => setResolutionDialog('resolve')}>
              Resolver
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <ReportAssignDialog
        open={assignOpen}
        currentAssignedToUserId={report?.assigned_to_user_id ?? null}
        members={membersQuery.data ?? []}
        onClose={() => setAssignOpen(false)}
        onSubmit={handleAssign}
        isSubmitting={assignReport.isPending}
        error={null}
      />

      <ReportResolutionDialog
        open={resolutionDialog !== null}
        kind={resolutionDialog ?? 'resolve'}
        report={listItemForDialogs}
        onClose={() => setResolutionDialog(null)}
        onResolve={handleResolve}
        onDismiss={handleDismiss}
        isSubmitting={resolveReport.isPending || dismissReport.isPending}
        error={null}
      />
    </>
  );
}
