import { Chip } from '@mui/material';

import type { ModerationStatus } from '@prezio/shared-types';

const LABELS: Record<ModerationStatus, string> = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  merged: 'MERGED',
};

export function ModerationStatusChip({ status }: { status: ModerationStatus }) {
  return <Chip size="small" label={LABELS[status]} variant="outlined" />;
}
