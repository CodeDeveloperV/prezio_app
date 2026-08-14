import { Chip } from '@mui/material';

import type { OrgListingStatus } from '@prezio/shared-types';

const LABELS: Record<OrgListingStatus, string> = {
  active: 'ACTIVE',
  inactive: 'INACTIVE',
  not_listed: 'NO LISTADO',
};

const COLORS: Record<OrgListingStatus, 'success' | 'default' | 'warning'> = {
  active: 'success',
  inactive: 'warning',
  not_listed: 'default',
};

export function OrgStatusChip({ status }: { status: OrgListingStatus }) {
  return <Chip size="small" label={LABELS[status]} color={COLORS[status]} variant="outlined" />;
}
