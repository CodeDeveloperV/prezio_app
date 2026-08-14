import { useQuery } from '@tanstack/react-query';

import { getPricingHistory } from '../api/pricingApi';

export function usePricingHistory(storeId: number | null, storeProductId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'pricing', 'store-products', storeProductId, 'history'],
    queryFn: () => getPricingHistory(storeId as number, storeProductId as number),
    enabled: storeId !== null && storeProductId !== null,
  });
}
