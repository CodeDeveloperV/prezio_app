import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cancelCoupon, createCoupon, deleteCoupon, publishCoupon, updateCoupon } from '../api/couponsApi';

import type { CouponCreate, CouponUpdate } from '@prezio/shared-types';

const LIST_KEY_PREFIX = (storeId: number | null) => ['b2b', 'organizations', storeId, 'coupons'];

export function useCreateCoupon(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CouponCreate) => createCoupon(storeId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useUpdateCoupon(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ couponId, payload }: { couponId: number; payload: CouponUpdate }) =>
      updateCoupon(storeId as number, couponId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function usePublishCoupon(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (couponId: number) => publishCoupon(storeId as number, couponId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useCancelCoupon(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (couponId: number) => cancelCoupon(storeId as number, couponId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}

export function useDeleteCoupon(storeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (couponId: number) => deleteCoupon(storeId as number, couponId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY_PREFIX(storeId) });
    },
  });
}
