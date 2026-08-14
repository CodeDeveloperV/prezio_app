import { Text, YStack } from 'tamagui';

import { DEFAULT_ICON_STROKE_WIDTH, IconChartLine } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { formatMoney, formatMonthLabel, monthSortKey } from '../utils/format';
import { DashboardCard } from './DashboardCard';

import type { MonthlySummary } from '@prezio/shared-types';

interface SpendTrendChartProps {
  monthlyHistory: MonthlySummary[];
}

/** "Comparación con meses anteriores" + "Gráficas": trailing spend trend, oldest to newest. */
export function SpendTrendChart({ monthlyHistory }: SpendTrendChartProps) {
  const labelByX = new Map(
    monthlyHistory.map((entry) => [monthSortKey(entry.year, entry.month), formatMonthLabel(entry.year, entry.month)]),
  );
  const points = monthlyHistory.map((entry) => ({
    x: monthSortKey(entry.year, entry.month),
    y: Number(entry.total_spent),
  }));
  const hasSpend = points.some((point) => point.y > 0);

  return (
    <DashboardCard>
      <Text fontFamily="$heading" fontSize="$md" color="$color">
        Gasto mensual (últimos {monthlyHistory.length} meses)
      </Text>
      {hasSpend ? (
        <LineChart
          points={points}
          formatXLabel={(x) => labelByX.get(x) ?? String(x)}
          formatYLabel={(y) => formatMoney(y)}
        />
      ) : (
        <YStack alignItems="center" gap="$2" paddingVertical="$2">
          <IconChartLine color={colorTokens.textSecondary} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Todavía no hay suficiente historial de compras para graficar.
          </Text>
        </YStack>
      )}
    </DashboardCard>
  );
}
