import { useQuery } from '@tanstack/react-query';

import { listMyInvitations } from '../api/invitationsApi';

import type { ShoppingListInvitation } from '@prezio/shared-types';

export function useInvitationsQuery() {
  return useQuery<ShoppingListInvitation[], Error>({
    queryKey: ['invitations'],
    queryFn: listMyInvitations,
  });
}
