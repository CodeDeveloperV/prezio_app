import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface CouponConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor?: 'primary' | 'error';
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CouponConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmColor = 'primary',
  isSubmitting,
  onConfirm,
  onClose,
}: CouponConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" color={confirmColor} onClick={onConfirm} disabled={isSubmitting}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
