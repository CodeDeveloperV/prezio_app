import { endOfDay, endOfMonth, startOfDay, startOfMonth, startOfToday, subDays, subMonths } from 'date-fns';

export type DateRangePreset = 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'previous_month' | 'custom';

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Hoy',
  last_7_days: 'Últimos 7 días',
  last_30_days: 'Últimos 30 días',
  this_month: 'Este mes',
  previous_month: 'Mes anterior',
  custom: 'Personalizado',
};

export const DATE_RANGE_PRESET_OPTIONS: DateRangePreset[] = [
  'today',
  'last_7_days',
  'last_30_days',
  'this_month',
  'previous_month',
  'custom',
];

export interface DateRange {
  from: Date;
  to: Date;
}

/** Resolves a preset into a concrete [from, to] range; `custom` returns the last known range unchanged. */
export function resolvePresetRange(preset: DateRangePreset, currentRange: DateRange): DateRange {
  const today = startOfToday();
  switch (preset) {
    case 'today':
      return { from: startOfDay(today), to: endOfDay(today) };
    case 'last_7_days':
      return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) };
    case 'last_30_days':
      return { from: startOfDay(subDays(today, 29)), to: endOfDay(today) };
    case 'this_month':
      return { from: startOfMonth(today), to: endOfDay(today) };
    case 'previous_month': {
      const previousMonth = subMonths(today, 1);
      return { from: startOfMonth(previousMonth), to: endOfMonth(previousMonth) };
    }
    case 'custom':
      return currentRange;
  }
}

export const LIFECYCLE_COUNT_LABELS = {
  active: 'Activo',
  scheduled: 'Programado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
} as const;
