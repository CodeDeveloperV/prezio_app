import { useQuery } from '@tanstack/react-query';

import { listCategories } from '../api/catalogApi';

import type { Category } from '@prezio/shared-types';

export function useCategoriesQuery() {
  return useQuery<Category[], Error>({
    queryKey: ['categories'],
    queryFn: listCategories,
  });
}
