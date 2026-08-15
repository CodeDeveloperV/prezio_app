import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  cancelPromotion,
  createPromotion,
  deletePromotion,
  publishPromotion,
  updatePromotion,
} from '../api/promotionsApi';

import type { PromotionCreate, PromotionUpdate } from '@prezio/shared-types';

const LIST_KEY_PREFIX = (storeId: number | null) => ['b2b', 'organizations', storeId, 'promotions'];

export function useCreatePromotion(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PromotionCreate) => createPromotion(storeId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useUpdatePromotion(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ promotionId, payload }: { promotionId: number; payload: PromotionUpdate }) =>
      updatePromotion(storeId as number, promotionId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function usePublishPromotion(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promotionId: number) => publishPromotion(storeId as number, promotionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useCancelPromotion(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promotionId: number) => cancelPromotion(storeId as number, promotionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useDeletePromotion(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promotionId: number) => deletePromotion(storeId as number, promotionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}
