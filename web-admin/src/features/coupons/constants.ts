import type { CouponDisplayStatus, CouponType } from '@prezio/shared-types';

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  percentage_discount: 'Descuento porcentual',
  fixed_amount: 'Monto fijo',
};

export const COUPON_TYPE_OPTIONS: CouponType[] = ['percentage_discount', 'fixed_amount'];

export const COUPON_DISPLAY_STATUS_LABELS: Record<CouponDisplayStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  active: 'Activo',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

export const COUPON_DISPLAY_STATUS_COLORS: Record<CouponDisplayStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  scheduled: 'info',
  active: 'success',
  expired: 'default',
  cancelled: 'error',
};
