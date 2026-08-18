import { useQuery } from '@tanstack/react-query';

import { getStoreBranch, listStoreBranches, listStores } from '../api/storesApi';

import type { Store, StoreBranch, StoreBranchWithStore } from '@prezio/shared-types';

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

export function useStoreBranchQuery(branchId: number | null | undefined) {
  return useQuery<StoreBranchWithStore, Error>({
    queryKey: ['storeBranch', branchId],
    queryFn: () => getStoreBranch(branchId as number),
    enabled: branchId != null,
  });
}
