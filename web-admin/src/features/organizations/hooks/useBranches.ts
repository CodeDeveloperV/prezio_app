import { useQuery } from '@tanstack/react-query';

import { getBranches } from '../api/branchesApi';

export function useBranches(storeId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'branches'],
    queryFn: () => getBranches(storeId as number),
    enabled: storeId !== null,
  });
}
