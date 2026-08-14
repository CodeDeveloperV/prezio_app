import { useQuery } from '@tanstack/react-query';

import { getMembers } from '../api/membersApi';

export function useMembers(storeId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['b2b', 'organizations', storeId, 'members'],
    queryFn: () => getMembers(storeId as number),
    enabled: storeId !== null && enabled,
  });
}
