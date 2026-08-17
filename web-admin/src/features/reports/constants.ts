import type { ReportPriority, ReportResolutionType, ReportStatus, ReportType } from '@prezio/shared-types';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  incorrect_product_info: 'Información incorrecta',
  incorrect_barcode: 'Código de barras incorrecto',
  duplicate_product: 'Producto duplicado',
  incorrect_price: 'Precio incorrecto',
  incorrect_availability: 'Disponibilidad incorrecta',
  product_not_sold_here: 'No se vende en esta sucursal',
  other: 'Otro',
};

export const REPORT_TYPE_OPTIONS: ReportType[] = [
  'incorrect_product_info',
  'incorrect_barcode',
  'duplicate_product',
  'incorrect_price',
  'incorrect_availability',
  'product_not_sold_here',
  'other',
];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Abierto',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
};

export const REPORT_STATUS_OPTIONS: ReportStatus[] = ['open', 'in_review', 'resolved', 'dismissed'];

export const REPORT_STATUS_COLORS: Record<ReportStatus, 'default' | 'info' | 'success' | 'error'> = {
  open: 'info',
  in_review: 'default',
  resolved: 'success',
  dismissed: 'error',
};

export const REPORT_PRIORITY_LABELS: Record<ReportPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const REPORT_PRIORITY_OPTIONS: ReportPriority[] = ['low', 'medium', 'high', 'critical'];

export const REPORT_PRIORITY_COLORS: Record<ReportPriority, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  critical: 'error',
};

export const REPORT_RESOLUTION_TYPE_LABELS: Record<ReportResolutionType, string> = {
  data_corrected: 'Datos corregidos',
  price_updated: 'Precio actualizado',
  availability_updated: 'Disponibilidad actualizada',
  listing_disabled: 'Listado desactivado',
  escalated_to_catalog_moderation: 'Escalado a moderación de catálogo',
  no_issue_found: 'No se encontró un problema',
  duplicate_confirmed: 'Duplicado confirmado',
  other: 'Otro',
};

/** Which resolution types make sense for each report type -- shown first in the resolve
 * dialog's select, though any resolution type remains selectable (spec doesn't restrict this
 * server-side). */
export const SUGGESTED_RESOLUTION_TYPES_BY_REPORT_TYPE: Record<ReportType, ReportResolutionType[]> = {
  incorrect_product_info: ['data_corrected', 'no_issue_found', 'other'],
  incorrect_barcode: ['data_corrected', 'no_issue_found', 'other'],
  duplicate_product: ['escalated_to_catalog_moderation', 'duplicate_confirmed', 'no_issue_found', 'other'],
  incorrect_price: ['price_updated', 'no_issue_found', 'other'],
  incorrect_availability: ['availability_updated', 'no_issue_found', 'other'],
  product_not_sold_here: ['listing_disabled', 'no_issue_found', 'other'],
  other: ['other', 'no_issue_found'],
};
