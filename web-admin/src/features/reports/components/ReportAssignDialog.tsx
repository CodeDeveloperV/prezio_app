import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

import type { OrganizationMemberRead } from '@prezio/shared-types';

interface ReportAssignDialogProps {
  open: boolean;
  currentAssignedToUserId: number | null;
  members: OrganizationMemberRead[];
  onClose: () => void;
  onSubmit: (assignedToUserId: number | null) => void;
  isSubmitting: boolean;
  error: string | null;
}

const ASSIGN_TO_ME_VALUE = 'me';

export function ReportAssignDialog({
  open,
  currentAssignedToUserId,
  members,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: ReportAssignDialogProps) {
  const [selected, setSelected] = useState<string>(ASSIGN_TO_ME_VALUE);

  useEffect(() => {
    if (open) {
      setSelected(currentAssignedToUserId !== null ? String(currentAssignedToUserId) : ASSIGN_TO_ME_VALUE);
    }
  }, [open, currentAssignedToUserId]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Asignar reporte</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Asignado a" select value={selected} onChange={(e) => setSelected(e.target.value)} fullWidth>
            <MenuItem value={ASSIGN_TO_ME_VALUE}>Asignarme a mí</MenuItem>
            {members.map((member) => (
              <MenuItem key={member.id} value={String(member.user_id)}>
                {member.user_email}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          disabled={isSubmitting}
          onClick={() => onSubmit(selected === ASSIGN_TO_ME_VALUE ? null : Number(selected))}
        >
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
