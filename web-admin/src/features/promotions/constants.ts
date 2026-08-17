import type { PromotionDisplayStatus, PromotionType } from '@prezio/shared-types';

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  percentage_discount: 'Descuento porcentual',
  fixed_discount: 'Descuento fijo',
  special_price: 'Precio especial',
  buy_x_get_y: 'Lleva X, paga Y',
};

export const PROMOTION_DISPLAY_STATUS_LABELS: Record<PromotionDisplayStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  active: 'Activa',
  expired: 'Expirada',
  cancelled: 'Cancelada',
};

export const PROMOTION_DISPLAY_STATUS_COLORS: Record<
  PromotionDisplayStatus,
  'default' | 'info' | 'success' | 'error'
> = {
  draft: 'default',
  scheduled: 'info',
  active: 'success',
  expired: 'default',
  cancelled: 'error',
};

export const PROMOTION_TYPE_OPTIONS: PromotionType[] = [
  'percentage_discount',
  'fixed_discount',
  'special_price',
  'buy_x_get_y',
];
