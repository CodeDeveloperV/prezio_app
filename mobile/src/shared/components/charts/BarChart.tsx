import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Text } from 'tamagui';

import { palette } from '../../../app/theme/tokens';

export interface BarChartBar {
  label: string;
  value: number;
}

interface BarChartProps {
  bars: BarChartBar[];
  height?: number;
  formatValueLabel?: (value: number) => string;
  emptyLabel?: string;
  barColor?: string;
  axisColor?: string;
  labelColor?: string;
}

const PADDING = { top: 20, right: 8, bottom: 32, left: 8 };
const DEFAULT_HEIGHT = 180;
const BAR_GAP_RATIO = 0.35;
const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
});

/**
 * Minimal, dependency-free bar chart built on react-native-svg, mirroring LineChart's shape --
 * generic {label, value} bars plus a caller-supplied value formatter. Used for store/category
 * spend breakdowns (Epic 13). No zoom/pan/animation, same as LineChart.
 */
export function BarChart({
  bars,
  height = DEFAULT_HEIGHT,
  formatValueLabel = (value) => value.toFixed(2),
  emptyLabel = 'No hay suficientes datos para graficar.',
  barColor = palette.green,
  axisColor = palette.gray100,
  labelColor = palette.slate500,
}: BarChartProps) {
  const [width, setWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  if (bars.length === 0) {
    return (
      <View onLayout={handleLayout}>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          {emptyLabel}
        </Text>
      </View>
    );
  }

  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);
  const chartWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const chartHeight = height - PADDING.top - PADDING.bottom;
  const baselineY = height - PADDING.bottom;
  const slotWidth = chartWidth / bars.length;
  const barWidth = Math.max(slotWidth * (1 - BAR_GAP_RATIO), 1);

  return (
    <View onLayout={handleLayout} style={styles.fullWidth}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {bars.map((bar, index) => {
            const barHeight = (bar.value / maxValue) * chartHeight;
            const x = PADDING.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const y = baselineY - barHeight;
            return (
              <Rect key={`${bar.label}-${index}`} x={x} y={y} width={barWidth} height={Math.max(barHeight, 1)} rx={4} fill={barColor} />
            );
          })}

          <Rect x={PADDING.left} y={baselineY} width={chartWidth} height={1} fill={axisColor} />

          {bars.map((bar, index) => {
            const x = PADDING.left + index * slotWidth + slotWidth / 2;
            return (
              <SvgText key={`value-${bar.label}-${index}`} x={x} y={baselineY - (bar.value / maxValue) * chartHeight - 6} fontSize={10} fill={labelColor} textAnchor="middle">
                {formatValueLabel(bar.value)}
              </SvgText>
            );
          })}

          {bars.map((bar, index) => {
            const x = PADDING.left + index * slotWidth + slotWidth / 2;
            return (
              <SvgText key={`label-${bar.label}-${index}`} x={x} y={height - 8} fontSize={10} fill={labelColor} textAnchor="middle">
                {bar.label.length > 10 ? `${bar.label.slice(0, 9)}…` : bar.label}
              </SvgText>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
