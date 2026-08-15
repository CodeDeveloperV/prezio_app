import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface PromotionConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor?: 'primary' | 'error';
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function PromotionConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmColor = 'primary',
  isSubmitting,
  onConfirm,
  onClose,
}: PromotionConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color={confirmColor} onClick={onConfirm} disabled={isSubmitting}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
