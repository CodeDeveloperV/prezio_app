import { useQuery } from '@tanstack/react-query';

import { listStoreBranches, listStores } from '../api/storesApi';

import type { Store, StoreBranch } from '@prezio/shared-types';

export function useStoresQuery() {
  return useQuery<Store[], Error>({
    queryKey: ['stores'],
    queryFn: listStores,
  });
}

export function useStoreBranchesQuery(storeId: number | undefined) {
  return useQuery<StoreBranch[], Error>({
    queryKey: ['storeBranches', storeId],
    queryFn: () => listStoreBranches(storeId as number),
    enabled: storeId !== undefined,
  });
}
