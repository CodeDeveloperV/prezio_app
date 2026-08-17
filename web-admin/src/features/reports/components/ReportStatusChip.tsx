import { Chip } from '@mui/material';

import { REPORT_STATUS_COLORS, REPORT_STATUS_LABELS } from '../constants';

import type { ReportStatus } from '@prezio/shared-types';

export function ReportStatusChip({ status }: { status: ReportStatus }) {
  return <Chip size="small" label={REPORT_STATUS_LABELS[status]} color={REPORT_STATUS_COLORS[status]} />;
}
