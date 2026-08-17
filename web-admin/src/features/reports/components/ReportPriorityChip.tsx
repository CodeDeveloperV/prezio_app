import { Chip } from '@mui/material';

import { REPORT_PRIORITY_COLORS, REPORT_PRIORITY_LABELS } from '../constants';

import type { ReportPriority } from '@prezio/shared-types';

export function ReportPriorityChip({ priority }: { priority: ReportPriority }) {
  return <Chip size="small" label={REPORT_PRIORITY_LABELS[priority]} color={REPORT_PRIORITY_COLORS[priority]} />;
}
