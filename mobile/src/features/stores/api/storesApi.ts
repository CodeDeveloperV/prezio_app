import { httpClient } from '../../../shared/services/api/httpClient';

import type { Store, StoreBranch, StoreBranchWithStore } from '@prezio/shared-types';

export function listStores(): Promise<Store[]> {
  return httpClient.get('stores').json<Store[]>();
}

export function listStoreBranches(storeId: number): Promise<StoreBranch[]> {
  return httpClient.get(`stores/${storeId}/branches`).json<StoreBranch[]>();
}

export function getStoreBranch(branchId: number): Promise<StoreBranchWithStore> {
  return httpClient.get(`stores/branches/${branchId}`).json<StoreBranchWithStore>();
}
