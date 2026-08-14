import { useQuery } from '@tanstack/react-query';

import { getMyMemberships } from '../api/organizationsApi';

export function useMyMemberships() {
  return useQuery({
    queryKey: ['b2b', 'memberships', 'me'],
    queryFn: getMyMemberships,
  });
}
