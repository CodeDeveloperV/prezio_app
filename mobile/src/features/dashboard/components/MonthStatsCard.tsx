import { Card, Text, XStack, YStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconReceipt,
  IconWallet,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { formatMoney } from '../utils/format';

import type { MonthlySummary } from '@prezio/shared-types';

interface MonthStatsCardProps {
  currentMonth: MonthlySummary;
  previousMonth: MonthlySummary;
}

function comparisonLabel(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? 'Sin gastos registrados el mes pasado.' : 'No gastaste nada el mes pasado.';
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change));
  if (rounded === 0) {
    return 'Gastaste igual que el mes pasado.';
  }
  return change > 0
    ? `${rounded}% más que el mes pasado`
    : `${rounded}% menos que el mes pasado`;
}

/** "Cantidad gastada" + "Ahorro mensual" side by side, plus a comparison vs the previous month. */
export function MonthStatsCard({ currentMonth, previousMonth }: MonthStatsCardProps) {
  const spent = Number(currentMonth.total_spent);
  const previousSpent = Number(previousMonth.total_spent);

  return (
    <Card
      elevation={2}
      backgroundColor="$surface"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      padding="$5"
      gap="$4"
    >
      <Text fontFamily="$heading" fontSize="$md" color="$color">
        Este mes
      </Text>

      <XStack gap="$4">
        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2">
            <IconReceipt color={colorTokens.textSecondary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              Gastado
            </Text>
          </XStack>
          <Text fontFamily="$heading" fontSize="$xl" color="$color">
            {formatMoney(currentMonth.total_spent)}
          </Text>
        </YStack>

        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2">
            <IconWallet color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              Ahorrado
            </Text>
          </XStack>
          <Text fontFamily="$heading" fontSize="$xl" color="$primary">
            {formatMoney(currentMonth.total_savings)}
          </Text>
        </YStack>
      </XStack>

      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
        {comparisonLabel(spent, previousSpent)}
      </Text>
    </Card>
  );
}
