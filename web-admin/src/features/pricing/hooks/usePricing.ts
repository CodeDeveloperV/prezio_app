import { useQuery } from '@tanstack/react-query';

import { getPricing } from '../api/pricingApi';

import type { PricingFilters } from '../api/pricingApi';

export function usePricing(storeId: number | null, filters: PricingFilters) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'pricing', 'store-products', filters],
    queryFn: () => getPricing(storeId as number, filters),
    enabled: storeId !== null,
  });
}
