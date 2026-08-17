import { httpClient } from '@/shared/services/api/httpClient';

import type { MyMembershipRead } from '@prezio/shared-types';

// GET /b2b/memberships/me -- one row per organization the current user belongs to (any status),
// used to resolve the caller's role/branch scope and drive the organization switcher.
export function getMyMemberships(): Promise<MyMembershipRead[]> {
  return httpClient.get('b2b/memberships/me').json<MyMembershipRead[]>();
}
