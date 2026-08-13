import { useState } from 'react';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import { DEFAULT_ICON_STROKE_WIDTH, IconEdit, IconWallet } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useUpdateBudgetMutation } from '../hooks/useUpdateBudgetMutation';
import { formatMoney } from '../utils/format';

interface BudgetCardProps {
  monthlyBudget: string | null;
  remainingBudget: string | null;
}

/** "Presupuesto restante". Lets the user set/edit their monthly budget inline since the
 * backend has no budget-setting UI anywhere else in the app yet. */
export function BudgetCard({ monthlyBudget, remainingBudget }: BudgetCardProps) {
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState(monthlyBudget ?? '');
  const updateBudgetMutation = useUpdateBudgetMutation();

  const handleSave = () => {
    const trimmed = budgetInput.trim();
    if (trimmed === '') {
      updateBudgetMutation.mutate({ monthly_budget: null }, { onSuccess: () => setEditing(false) });
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return;
    }
    updateBudgetMutation.mutate(
      { monthly_budget: parsed.toFixed(2) },
      { onSuccess: () => setEditing(false) },
    );
  };

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
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2">
          <IconWallet color={colorTokens.textSecondary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            Presupuesto restante
          </Text>
        </XStack>
        {!editing && (
          <Button size="$2" circular chromeless onPress={() => setEditing(true)}>
            <IconEdit color={colorTokens.textSecondary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          </Button>
        )}
      </XStack>

      {editing ? (
        <XStack gap="$2" alignItems="center">
          <Input
            flex={1}
            keyboardType="decimal-pad"
            value={budgetInput}
            onChangeText={setBudgetInput}
            placeholder="Presupuesto mensual, ej. 300.00"
          />
          <Button size="$3" backgroundColor="$primary" color="$white" onPress={handleSave}>
            Guardar
          </Button>
        </XStack>
      ) : monthlyBudget === null ? (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Todavía no defines un presupuesto mensual.
        </Text>
      ) : (
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$xl" color={remainingBudget !== null && Number(remainingBudget) < 0 ? '$danger' : '$color'}>
            {formatMoney(remainingBudget ?? '0')}
          </Text>
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
            de {formatMoney(monthlyBudget)} este mes
          </Text>
        </YStack>
      )}
    </Card>
  );
}
