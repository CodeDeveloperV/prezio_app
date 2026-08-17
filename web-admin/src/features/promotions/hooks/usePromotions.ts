import { useQuery } from '@tanstack/react-query';

import { getPromotion, getPromotions } from '../api/promotionsApi';

import type { PromotionFilters } from '../api/promotionsApi';

export function usePromotions(storeId: number | null, filters: PromotionFilters) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'promotions', filters],
    queryFn: () => getPromotions(storeId as number, filters),
    enabled: storeId !== null,
  });
}

export function usePromotion(storeId: number | null, promotionId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'promotions', 'detail', promotionId],
    queryFn: () => getPromotion(storeId as number, promotionId as number),
    enabled: storeId !== null && promotionId !== null,
  });
}
