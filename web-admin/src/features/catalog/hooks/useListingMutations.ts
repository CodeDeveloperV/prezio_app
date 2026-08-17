import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createCatalogProductListings, updateCatalogProductListing } from '../api/catalogApi';

import type { CreateListingRequest, UpdateListingStatusRequest } from '@prezio/shared-types';

export function useCreateListings(storeId: number | null, productId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateListingRequest) =>
      createCatalogProductListings(storeId as number, productId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['b2b', 'organizations', storeId, 'catalog', 'products'],
      });
    },
  });
}

export function useUpdateListingStatus(storeId: number | null, productId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, payload }: { branchId: number; payload: UpdateListingStatusRequest }) =>
      updateCatalogProductListing(storeId as number, productId as number, branchId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['b2b', 'organizations', storeId, 'catalog', 'products'],
      });
    },
  });
}
