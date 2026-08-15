import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconChartBar, IconChartPie, IconShoppingCart } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { AnalyticsCard } from '../components/AnalyticsCard';
import { PeriodSelector } from '../components/PeriodSelector';
import { useAnalyticsQuery } from '../hooks/useAnalyticsQuery';
import { formatMoney, formatMonthLabel, formatPercentage, monthSortKey } from '../utils/format';

import type { AnalyticsPeriod } from '@prezio/shared-types';

/**
 * Dedicated "Estadísticas" screen (Epic 13) -- kept separate from Dashboard, which only shows a
 * small summary + CTA into here. Reuses the react-native-svg chart infra from Epic 6
 * (LineChart) plus a new BarChart built the same dependency-free way, no new charting library.
 */
export function AnalyticsScreen() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('3m');
  const analyticsQuery = useAnalyticsQuery(period);

  return (
    <ScreenContainer>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$xl" color="$color">
          Estadísticas
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Un resumen personal de tus compras -- no son datos oficiales de inflación ni de precios.
        </Text>
      </YStack>

      <PeriodSelector value={period} onChange={setPeriod} />

      {analyticsQuery.isPending && (
        <YStack alignItems="center" padding="$5">
          <ActivityIndicator color={colorTokens.primary} />
        </YStack>
      )}

      {analyticsQuery.isError && (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          No pudimos cargar tus estadísticas. Desliza para reintentar.
        </Text>
      )}

      {analyticsQuery.isSuccess && (
        <>
          <AnalyticsCard>
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              Total gastado
            </Text>
            <Text fontFamily="$heading" fontSize="$xxl" color="$color">
              {formatMoney(analyticsQuery.data.total_spend.total_spent)}
            </Text>
            {analyticsQuery.data.total_spend.meta.unattributed_store_count > 0 && (
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                {analyticsQuery.data.total_spend.meta.unattributed_store_count} compras sin sucursal
                registrada en este período.
              </Text>
            )}
          </AnalyticsCard>

          <AnalyticsCard>
            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Evolución mensual
            </Text>
            {(() => {
              const months = analyticsQuery.data.monthly_evolution.months;
              const labelByX = new Map(
                months.map((entry) => [
                  monthSortKey(entry.year, entry.month),
                  `${formatMonthLabel(entry.year, entry.month)}${entry.is_partial ? ' (parcial)' : ''}`,
                ]),
              );
              const points = months.map((entry) => ({
                x: monthSortKey(entry.year, entry.month),
                y: Number(entry.total_spent),
              }));
              return (
                <LineChart
                  points={points}
                  formatXLabel={(x) => labelByX.get(x) ?? String(x)}
                  formatYLabel={(y) => formatMoney(y)}
                />
              );
            })()}
          </AnalyticsCard>

          <AnalyticsCard>
            <XStack alignItems="center" gap="$2">
              <IconChartBar color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Supermercado que más usas
              </Text>
            </XStack>
            {analyticsQuery.data.most_used_store.store_name ? (
              <Text fontFamily="$body" fontSize="$sm" color="$color">
                {analyticsQuery.data.most_used_store.store_name} -- {analyticsQuery.data.most_used_store.session_count}{' '}
                {analyticsQuery.data.most_used_store.session_count === 1 ? 'visita' : 'visitas'}
              </Text>
            ) : (
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Todavía no hay compras con sucursal registrada en este período.
              </Text>
            )}
          </AnalyticsCard>

          <AnalyticsCard>
            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Gasto por supermercado
            </Text>
            <BarChart
              bars={analyticsQuery.data.spend_by_store.by_chain.map((store) => ({
                label: store.store_name,
                value: Number(store.total_spent),
              }))}
              formatValueLabel={(value) => formatMoney(value)}
            />
            {Number(analyticsQuery.data.spend_by_store.unattributed_spent) > 0 && (
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                {analyticsQuery.data.spend_by_store.unattributed_label}:{' '}
                {formatMoney(analyticsQuery.data.spend_by_store.unattributed_spent)}
              </Text>
            )}
          </AnalyticsCard>

          <AnalyticsCard>
            <XStack alignItems="center" gap="$2">
              <IconChartPie color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Gasto por categoría
              </Text>
            </XStack>
            <BarChart
              bars={analyticsQuery.data.spend_by_category.categories.map((category) => ({
                label: category.category_name,
                value: Number(category.total_spent),
              }))}
              formatValueLabel={(value) => formatMoney(value)}
            />
          </AnalyticsCard>

          <AnalyticsCard>
            <Text fontFamily="$heading" fontSize="$md" color="$color">
              Inflación de mi canasta
            </Text>
            {analyticsQuery.data.personal_inflation.has_sufficient_data &&
            analyticsQuery.data.personal_inflation.personal_inflation_percentage !== null ? (
              <>
                <Text fontFamily="$heading" fontSize="$xxl" color="$color">
                  {formatPercentage(analyticsQuery.data.personal_inflation.personal_inflation_percentage)}
                </Text>
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  Estimado personal comparando tus precios recientes con los de hace{' '}
                  {analyticsQuery.data.personal_inflation.window_months} meses -- no es la inflación oficial.
                </Text>
              </>
            ) : (
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Todavía no tienes suficiente historial de compras repetidas para estimar esto.
              </Text>
            )}
          </AnalyticsCard>

          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <IconShoppingCart color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              <Text fontFamily="$heading" fontSize="$md" color="$color">
                Productos favoritos
              </Text>
            </XStack>
            {analyticsQuery.data.favorite_products.products.length === 0 ? (
              <YStack backgroundColor="$surface" borderRadius="$3" padding="$5" alignItems="center">
                <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
                  Todavía no marcaste productos como comprados en este período.
                </Text>
              </YStack>
            ) : (
              <YStack gap="$2">
                {analyticsQuery.data.favorite_products.products.map((product, index) => (
                  <XStack
                    key={product.product_id}
                    alignItems="center"
                    gap="$3"
                    backgroundColor="$surface"
                    borderRadius="$3"
                    padding="$3"
                  >
                    <YStack width={28} height={28} borderRadius="$full" backgroundColor="$background" alignItems="center" justifyContent="center">
                      <Text fontFamily="$heading" fontSize="$xs" color="$primaryText">
                        {index + 1}
                      </Text>
                    </YStack>
                    <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color" numberOfLines={1}>
                      {product.product_name}
                    </Text>
                    <Text fontFamily="$heading" fontSize="$sm" color="$colorSecondary">
                      {product.purchase_count}x
                    </Text>
                  </XStack>
                ))}
              </YStack>
            )}
          </YStack>
        </>
      )}
    </ScreenContainer>
  );
}
