import { Card, Text } from 'tamagui';

import { LineChart } from '../../../shared/components/charts/LineChart';
import { formatMoney, formatMonthLabel, monthSortKey } from '../utils/format';

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
    <Card
      elevation={2}
      backgroundColor="$surface"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      padding="$5"
      gap="$3"
    >
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
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Todavía no hay suficiente historial de compras para graficar.
        </Text>
      )}
    </Card>
  );
}
