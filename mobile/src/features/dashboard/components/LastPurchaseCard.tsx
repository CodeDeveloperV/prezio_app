import { Card, Text, XStack, YStack } from 'tamagui';

import { DEFAULT_ICON_STROKE_WIDTH, IconHistory } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { formatMoney } from '../utils/format';

import type { LastPurchase } from '@prezio/shared-types';

interface LastPurchaseCardProps {
  lastPurchase: LastPurchase | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "Última compra": the most recently checked shopping-list item, price-snapshotted. */
export function LastPurchaseCard({ lastPurchase }: LastPurchaseCardProps) {
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
      <XStack alignItems="center" gap="$2">
        <IconHistory color={colorTokens.textSecondary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
          Última compra
        </Text>
      </XStack>

      {lastPurchase === null ? (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Todavía no marcaste ningún producto como comprado.
        </Text>
      ) : (
        <XStack justifyContent="space-between" alignItems="center">
          <YStack flex={1} gap="$0.5">
            <Text fontFamily="$heading" fontSize="$md" color="$color" numberOfLines={1}>
              {lastPurchase.product_name}
            </Text>
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              x{lastPurchase.quantity} · {formatDateTime(lastPurchase.checked_at)}
            </Text>
          </YStack>
          <Text fontFamily="$heading" fontSize="$md" color="$primary">
            {formatMoney(lastPurchase.price_at_check)}
          </Text>
        </XStack>
      )}
    </Card>
  );
}
