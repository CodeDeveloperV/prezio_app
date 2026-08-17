import { useQuery } from '@tanstack/react-query';

import { getCoupon, getCoupons } from '../api/couponsApi';

import type { CouponFilters } from '../api/couponsApi';

export function useCoupons(storeId: number | null, filters: CouponFilters) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'coupons', filters],
    queryFn: () => getCoupons(storeId as number, filters),
    enabled: storeId !== null,
  });
}

export function useCoupon(storeId: number | null, couponId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'coupons', 'detail', couponId],
    queryFn: () => getCoupon(storeId as number, couponId as number),
    enabled: storeId !== null && couponId !== null,
  });
}
