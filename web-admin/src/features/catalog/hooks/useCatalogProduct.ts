import { useQuery } from '@tanstack/react-query';

import { getCatalogProduct } from '../api/catalogApi';

export function useCatalogProduct(storeId: number | null, productId: number | null) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'catalog', 'products', productId],
    queryFn: () => getCatalogProduct(storeId as number, productId as number),
    enabled: storeId !== null && productId !== null,
  });
}
