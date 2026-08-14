import { Button, ScrollView, Text, XStack } from 'tamagui';

import { colorTokens } from '../../../app/theme/tokens';

import type { AnalyticsPeriod } from '@prezio/shared-types';

const OPTIONS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: '30d', label: '30 días' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '12 meses' },
  { value: 'all', label: 'Todo' },
];

interface PeriodSelectorProps {
  value: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <XStack gap="$2" paddingVertical="$1">
        {OPTIONS.map((option) => {
          const isSelected = option.value === value;
          return (
            <Button
              key={option.value}
              size="$2"
              borderRadius="$full"
              backgroundColor={isSelected ? '$primary' : '$surface'}
              borderWidth={1}
              borderColor={isSelected ? '$primary' : '$borderColor'}
              onPress={() => onChange(option.value)}
            >
              <Text fontFamily="$body" fontSize="$xs" color={isSelected ? colorTokens.white : '$color'}>
                {option.label}
              </Text>
            </Button>
          );
        })}
      </XStack>
    </ScrollView>
  );
}
