import { httpClient } from '@/shared/services/api/httpClient';

import type { BranchCreate, BranchUpdate, StoreBranch } from '@prezio/shared-types';

export function getBranches(storeId: number): Promise<StoreBranch[]> {
  return httpClient.get(`b2b/organizations/${storeId}/branches`).json<StoreBranch[]>();
}

export function createBranch(storeId: number, payload: BranchCreate): Promise<StoreBranch> {
  return httpClient.post(`b2b/organizations/${storeId}/branches`, { json: payload }).json<StoreBranch>();
}

export function updateBranch(storeId: number, branchId: number, payload: BranchUpdate): Promise<StoreBranch> {
  return httpClient
    .patch(`b2b/organizations/${storeId}/branches/${branchId}`, { json: payload })
    .json<StoreBranch>();
}
