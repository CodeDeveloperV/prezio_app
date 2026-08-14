import { useQuery } from '@tanstack/react-query';

import { getCatalogProducts } from '../api/catalogApi';

import type { CatalogProductFilters } from '../api/catalogApi';

export function useCatalogProducts(storeId: number | null, filters: CatalogProductFilters) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'catalog', 'products', filters],
    queryFn: () => getCatalogProducts(storeId as number, filters),
    enabled: storeId !== null,
  });
}
