import type { PropsWithChildren } from 'react';
import { Card } from 'tamagui';
import type { GetProps } from 'tamagui';

type CardProps = GetProps<typeof Card>;

interface DashboardCardProps {
  gap?: CardProps['gap'];
  onPress?: CardProps['onPress'];
  pressStyle?: CardProps['pressStyle'];
}

/** Shared surface for every stat/summary card on the dashboard: same elevation,
 * fill, border, and radius so the feed reads as one coherent stack. */
export function DashboardCard({ gap = '$3', onPress, pressStyle, children }: PropsWithChildren<DashboardCardProps>) {
  return (
    <Card
      elevation={2}
      backgroundColor="$surface"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      padding="$5"
      gap={gap}
      onPress={onPress}
      pressStyle={pressStyle}
    >
      {children}
    </Card>
  );
}
