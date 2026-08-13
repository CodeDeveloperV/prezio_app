import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateMonthlyBudget } from '../api/dashboardApi';

import type { UserBudgetRead, UserBudgetUpdate } from '@prezio/shared-types';

export function useUpdateBudgetMutation() {
  const queryClient = useQueryClient();
  return useMutation<UserBudgetRead, Error, UserBudgetUpdate>({
    mutationFn: updateMonthlyBudget,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] }),
  });
}
