import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Text } from 'tamagui';

import { palette } from '../../../app/theme/tokens';

export interface LineChartPoint {
  x: number;
  y: number;
}

interface LineChartProps {
  points: LineChartPoint[];
  height?: number;
  formatXLabel?: (x: number) => string;
  formatYLabel?: (y: number) => string;
  emptyLabel?: string;
  lineColor?: string;
  pointColor?: string;
  axisColor?: string;
  labelColor?: string;
}

const PADDING = { top: 24, right: 12, bottom: 28, left: 12 };
const DEFAULT_HEIGHT = 180;

/**
 * Minimal, dependency-free line chart built on react-native-svg. Not tied to any
 * feature/domain: callers pass generic {x, y} points plus their own label formatters.
 * Deliberately no zoom/pan/animation -- add those (or swap in a charting library) only
 * if a concrete use case needs them.
 */
export function LineChart({
  points,
  height = DEFAULT_HEIGHT,
  formatXLabel = (x) => String(x),
  formatYLabel = (y) => y.toFixed(2),
  emptyLabel = 'No hay suficientes datos para graficar.',
  lineColor = palette.green,
  pointColor = palette.greenPress,
  axisColor = palette.gray100,
  labelColor = palette.slate500,
}: LineChartProps) {
  const [width, setWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  if (points.length === 0) {
    return (
      <View onLayout={handleLayout}>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          {emptyLabel}
        </Text>
      </View>
    );
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const xs = sorted.map((p) => p.x);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  const isSinglePoint = sorted.length === 1;
  const yRange = maxY - minY || 1; // every price is equal (or a single point) -- avoid divide-by-zero
  const xRange = maxX - minX || 1;

  const chartWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const chartHeight = height - PADDING.top - PADDING.bottom;
  const baselineY = height - PADDING.bottom;

  function toScreenX(x: number): number {
    if (isSinglePoint) return PADDING.left + chartWidth / 2;
    return PADDING.left + ((x - minX) / xRange) * chartWidth;
  }

  function toScreenY(y: number): number {
    return PADDING.top + chartHeight - ((y - minY) / yRange) * chartHeight;
  }

  const linePoints = sorted.map((p) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(' ');

  return (
    <View onLayout={handleLayout} style={{ width: '100%' }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={baselineY} stroke={axisColor} strokeWidth={1} />
          <Line x1={PADDING.left} y1={baselineY} x2={width - PADDING.right} y2={baselineY} stroke={axisColor} strokeWidth={1} />

          <SvgText x={PADDING.left} y={PADDING.top - 8} fontSize={11} fill={labelColor}>
            {formatYLabel(maxY)}
          </SvgText>
          <SvgText x={PADDING.left} y={baselineY + 18} fontSize={11} fill={labelColor}>
            {formatYLabel(minY)}
          </SvgText>

          {!isSinglePoint && (
            <Polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth={2} />
          )}

          {sorted.map((point, index) => (
            <Circle key={index} cx={toScreenX(point.x)} cy={toScreenY(point.y)} r={4} fill={pointColor} />
          ))}

          <SvgText x={PADDING.left} y={height - 6} fontSize={11} fill={labelColor}>
            {formatXLabel(minX)}
          </SvgText>
          {!isSinglePoint && (
            <SvgText x={width - PADDING.right} y={height - 6} fontSize={11} fill={labelColor} textAnchor="end">
              {formatXLabel(maxX)}
            </SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}
