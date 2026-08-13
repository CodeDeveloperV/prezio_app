const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatMoney(value: string | number): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  return `$${amount.toFixed(2)}`;
}

export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export function monthSortKey(year: number, month: number): number {
  return year * 12 + month;
}
