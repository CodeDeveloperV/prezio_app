import { useMutation, useQuery } from '@tanstack/react-query';

import {
  confirmStoreProductMatch,
  createStoreProductPrice,
  getStoreProductPriceHistory,
  updateStoreProductPrice,
  type StoreProductCreateRequest,
} from '../api/pricingApi';

import type {
  PriceHistoryRead,
  PriceUpdateRequest,
  StoreProductRead,
} from '@prezio/shared-types';

export function useConfirmMatchMutation() {
  return useMutation<StoreProductRead, Error, number>({
    mutationFn: confirmStoreProductMatch,
  });
}

export function useUpdatePriceMutation() {
  return useMutation<
    StoreProductRead,
    Error,
    { storeProductId: number; request: PriceUpdateRequest }
  >({
    mutationFn: ({ storeProductId, request }) =>
      updateStoreProductPrice(storeProductId, request),
  });
}

export function useCreateStoreProductPriceMutation() {
  return useMutation<StoreProductRead, Error, StoreProductCreateRequest>({
    mutationFn: createStoreProductPrice,
  });
}

export function usePriceHistoryQuery(storeProductId: number | undefined) {
  return useQuery<PriceHistoryRead[], Error>({
    queryKey: ['priceHistory', storeProductId],
    queryFn: () => getStoreProductPriceHistory(storeProductId as number),
    enabled: storeProductId !== undefined,
  });
}
