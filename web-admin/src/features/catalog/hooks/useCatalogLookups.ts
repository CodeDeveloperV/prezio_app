import { useQuery } from '@tanstack/react-query';

import { getBrands, getCategories } from '../api/catalogApi';

export function useCategories() {
  return useQuery({ queryKey: ['catalog', 'categories'], queryFn: getCategories });
}

export function useBrands() {
  return useQuery({ queryKey: ['catalog', 'brands'], queryFn: getBrands });
}
