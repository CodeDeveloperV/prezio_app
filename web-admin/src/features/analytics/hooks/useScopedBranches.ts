import { useBranches } from '@/features/organizations/hooks/useBranches';
import { useActiveMembership } from '@/shared/store/authStore';

import type { StoreBranch } from '@prezio/shared-types';

/** Branch options for `BranchFilter`, restricted to what the current membership can see:
 * ORGANIZATION_ADMIN gets every branch, MANAGER/EMPLOYEE only their assigned branches. */
export function useScopedBranches(storeId: number | null): { branches: StoreBranch[]; isLoading: boolean } {
  const activeMembership = useActiveMembership();
  const branchesQuery = useBranches(storeId);
  const allBranches = branchesQuery.data ?? [];

  if (activeMembership?.role === 'organization_admin') {
    return { branches: allBranches, isLoading: branchesQuery.isLoading };
  }

  const assignedIds = new Set(activeMembership?.branch_ids ?? []);
  return { branches: allBranches.filter((branch) => assignedIds.has(branch.id)), isLoading: branchesQuery.isLoading };
}
