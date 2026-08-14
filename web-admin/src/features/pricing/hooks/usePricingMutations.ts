import { useMutation, useQueryClient } from '@tanstack/react-query';

import { batchUpdatePricing, updatePricingStoreProduct } from '../api/pricingApi';

import type { B2BBatchUpdateRequest, B2BPriceUpdateRequest } from '@prezio/shared-types';

export function useUpdatePricing(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeProductId, payload }: { storeProductId: number; payload: B2BPriceUpdateRequest }) =>
      updatePricingStoreProduct(storeId as number, storeProductId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['b2b', 'organizations', storeId, 'pricing', 'store-products'],
      });
    },
  });
}

export function useBatchUpdatePricing(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: B2BBatchUpdateRequest) => batchUpdatePricing(storeId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['b2b', 'organizations', storeId, 'pricing', 'store-products'],
      });
    },
  });
}
