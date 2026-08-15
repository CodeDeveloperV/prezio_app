import { Chip } from '@mui/material';

import { COUPON_DISPLAY_STATUS_COLORS, COUPON_DISPLAY_STATUS_LABELS } from '../constants';

import type { CouponDisplayStatus } from '@prezio/shared-types';

export function CouponStatusChip({ status }: { status: CouponDisplayStatus }) {
  return <Chip size="small" label={COUPON_DISPLAY_STATUS_LABELS[status]} color={COUPON_DISPLAY_STATUS_COLORS[status]} />;
}
