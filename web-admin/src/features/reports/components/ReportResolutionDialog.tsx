import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import { REPORT_RESOLUTION_TYPE_LABELS, SUGGESTED_RESOLUTION_TYPES_BY_REPORT_TYPE } from '../constants';

import type { ReportListItemRead, ReportResolutionType } from '@prezio/shared-types';

interface ReportResolutionDialogProps {
  open: boolean;
  kind: 'resolve' | 'dismiss';
  report: ReportListItemRead | null;
  onClose: () => void;
  onResolve: (resolutionType: ReportResolutionType, note: string | null) => void;
  onDismiss: (note: string | null) => void;
  isSubmitting: boolean;
  error: string | null;
}

export function ReportResolutionDialog({
  open,
  kind,
  report,
  onClose,
  onResolve,
  onDismiss,
  isSubmitting,
  error,
}: ReportResolutionDialogProps) {
  const [resolutionType, setResolutionType] = useState<ReportResolutionType>('data_corrected');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open && report) {
      const suggestions = SUGGESTED_RESOLUTION_TYPES_BY_REPORT_TYPE[report.type];
      setResolutionType(suggestions[0] ?? 'other');
      setNote('');
    }
  }, [open, report]);

  if (!report) return null;

  const suggestions = SUGGESTED_RESOLUTION_TYPES_BY_REPORT_TYPE[report.type];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{kind === 'resolve' ? 'Resolver reporte' : 'Descartar reporte'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {report.group_report_count > 1 && (
            <Alert severity="info">
              Este reporte agrupa {report.group_report_count} notificaciones sobre el mismo elemento. Al{' '}
              {kind === 'resolve' ? 'resolverlo' : 'descartarlo'} se cerrarán todas.
            </Alert>
          )}

          {kind === 'resolve' && (
            <TextField
              label="Tipo de resolución"
              select
              value={resolutionType}
              onChange={(e) => setResolutionType(e.target.value as ReportResolutionType)}
              fullWidth
            >
              {suggestions.map((option) => (
                <MenuItem key={option} value={option}>
                  {REPORT_RESOLUTION_TYPE_LABELS[option]}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            label="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          {kind === 'resolve' && resolutionType === 'escalated_to_catalog_moderation' && (
            <Typography variant="caption" color="text.secondary">
              Esto no fusiona ni edita el producto global -- solo marca el reporte como enviado a moderación de
              catálogo para su revisión centralizada.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          color={kind === 'resolve' ? 'primary' : 'error'}
          disabled={isSubmitting}
          onClick={() => (kind === 'resolve' ? onResolve(resolutionType, note.trim() || null) : onDismiss(note.trim() || null))}
        >
          {kind === 'resolve' ? 'Resolver' : 'Descartar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
