import type { PropsWithChildren } from 'react';
import { Card } from 'tamagui';
import type { GetProps } from 'tamagui';

type TamaguiSpace = GetProps<typeof Card>['gap'];

interface AnalyticsCardProps {
  gap?: TamaguiSpace;
}

/** Same surface as DashboardCard (elevation/fill/border/radius) -- kept as its own copy per
 * feature-slicing rather than importing across the dashboard/analytics boundary. */
export function AnalyticsCard({ gap = '$3', children }: PropsWithChildren<AnalyticsCardProps>) {
  return (
    <Card elevation={2} backgroundColor="$surface" borderWidth={1} borderColor="$borderColor" borderRadius="$4" padding="$5" gap={gap}>
      {children}
    </Card>
  );
}
