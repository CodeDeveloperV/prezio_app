import { useState } from 'react';
import { FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconAlertTriangle, IconChevronRight } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ComparisonStackParamList } from '../../../app/navigation/types';

import type { BranchComparisonResult, ProductComparisonLine, ProductComparisonStatus } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ComparisonStackParamList, 'ComparatorResult'>;

const STATUS_LABELS: Record<ProductComparisonStatus, string> = {
  available: 'Disponible',
  missing_product: 'No existe en esta sucursal',
  price_unavailable: 'Sin precio válido',
  stale_price: 'Precio desactualizado',
  unavailable: 'Agotado',
};

function ComparisonLineRow({ line }: { line: ProductComparisonLine }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" paddingVertical="$1">
      <YStack flex={1}>
        <Text fontFamily="$body" fontSize="$sm" color="$color">
          {line.product_name}
        </Text>
        <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
          {STATUS_LABELS[line.status]}
        </Text>
      </YStack>
      <Text fontFamily="$body" fontSize="$sm" color="$color">
        {line.subtotal !== null ? `$${line.subtotal}` : '—'}
      </Text>
    </XStack>
  );
}

function BranchResultCard({
  result,
  isCheapest,
  priceDiffVsCheapest,
  expanded,
  onToggle,
}: {
  result: BranchComparisonResult;
  isCheapest: boolean;
  // Positive dollar difference vs. the cheapest comparable branch -- null when this branch
  // isn't comparable (there's no valid baseline to diff against) or is itself the cheapest.
  priceDiffVsCheapest: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <YStack backgroundColor="$surface" borderRadius="$3" padding="$3" marginBottom="$2">
      <XStack alignItems="center" justifyContent="space-between" onPress={onToggle}>
        <YStack flex={1} gap="$0.5">
          <Text fontFamily="$heading" fontSize="$md" color="$color">
            {result.store_name} {result.branch_name}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            {result.found_products_count}/{result.total_known} productos encontrados
          </Text>
          {!result.comparable && (
            <XStack alignItems="center" gap="$1">
              <IconAlertTriangle
                color={colorTokens.warning}
                size={14}
                strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
              />
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                Cobertura insuficiente para comparar
              </Text>
            </XStack>
          )}
          {isCheapest && (
            <Text fontFamily="$heading" fontSize="$xs" color="$primary">
              Mejor precio
              {result.savings_vs_most_expensive !== null &&
                ` · Ahorras $${result.savings_vs_most_expensive} vs la alternativa más cara`}
            </Text>
          )}
          {!isCheapest && priceDiffVsCheapest !== null && (
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              +${priceDiffVsCheapest.toFixed(2)} vs mejor opción
            </Text>
          )}
        </YStack>
        <XStack alignItems="center" gap="$2">
          <Text fontFamily="$heading" fontSize="$lg" color="$color">
            ${result.total}
          </Text>
          <IconChevronRight
            color={colorTokens.textSecondary}
            size={18}
            strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
          />
        </XStack>
      </XStack>

      {expanded && (
        <YStack gap="$0.5" marginTop="$2" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$2">
          {result.lines.map((line) => (
            <ComparisonLineRow key={line.product_id} line={line} />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

/** Renders one independent total per branch -- deliberately not a cross-store greedy pick, see
 * backend `ComparisonService` docstring -- plus the coverage-gated savings banner. Cheapest/
 * diff labels only compare against `cheapest_comparable_branch_id`, so a branch that's cheap
 * merely because it's missing products (comparable = false) never gets a "mejor precio"-style
 * badge here. */
export function ComparatorResultScreen({ route }: Props) {
  const { result } = route.params;
  const [expandedBranchId, setExpandedBranchId] = useState<number | null>(null);

  const cheapest = result.results.find((branch) => branch.store_branch_id === result.cheapest_comparable_branch_id);
  const cheapestTotal = cheapest ? Number(cheapest.total) : null;

  return (
    <ScreenContainer scroll={false}>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Comparación de precios
        </Text>
        {result.estimated_savings !== null && cheapest ? (
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Ahorro estimado eligiendo {cheapest.store_name} {cheapest.branch_name}: ${result.estimated_savings}
          </Text>
        ) : (
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            No hay suficientes sucursales comparables para estimar un ahorro.
          </Text>
        )}
      </YStack>

      <FlatList
        data={result.results}
        keyExtractor={(branch) => String(branch.store_branch_id)}
        renderItem={({ item }) => {
          const isCheapest = item.store_branch_id === result.cheapest_comparable_branch_id;
          const priceDiffVsCheapest =
            item.comparable && !isCheapest && cheapestTotal !== null ? Number(item.total) - cheapestTotal : null;
          return (
            <BranchResultCard
              result={item}
              isCheapest={isCheapest}
              priceDiffVsCheapest={priceDiffVsCheapest}
              expanded={expandedBranchId === item.store_branch_id}
              onToggle={() =>
                setExpandedBranchId(expandedBranchId === item.store_branch_id ? null : item.store_branch_id)
              }
            />
          );
        }}
      />
    </ScreenContainer>
  );
}
