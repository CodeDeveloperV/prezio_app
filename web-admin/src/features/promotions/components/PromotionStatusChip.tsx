import { Chip } from '@mui/material';

import { PROMOTION_DISPLAY_STATUS_COLORS, PROMOTION_DISPLAY_STATUS_LABELS } from '../constants';

import type { PromotionDisplayStatus } from '@prezio/shared-types';

export function PromotionStatusChip({ status }: { status: PromotionDisplayStatus }) {
  return (
    <Chip size="small" label={PROMOTION_DISPLAY_STATUS_LABELS[status]} color={PROMOTION_DISPLAY_STATUS_COLORS[status]} />
  );
}
