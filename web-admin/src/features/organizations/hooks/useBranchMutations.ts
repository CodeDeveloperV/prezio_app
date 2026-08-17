import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createBranch, updateBranch } from '../api/branchesApi';

import type { BranchCreate, BranchUpdate } from '@prezio/shared-types';

export function useCreateBranch(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BranchCreate) => createBranch(storeId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b', 'organizations', storeId, 'branches'] });
    },
  });
}

export function useUpdateBranch(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, payload }: { branchId: number; payload: BranchUpdate }) =>
      updateBranch(storeId as number, branchId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b', 'organizations', storeId, 'branches'] });
    },
  });
}
