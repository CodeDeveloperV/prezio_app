import { HTTPError } from 'ky';

import { httpClient } from '@/shared/services/api/httpClient';

import type { OrganizationMemberInvite, OrganizationMemberRead, OrganizationMemberUpdate } from '@prezio/shared-types';

/** Thrown on any 4xx from the members endpoints -- carries the backend's `detail` message
 * (e.g. "Organization must keep at least one active admin") so the caller can show it as-is. */
export class MemberActionError extends Error {}

async function unwrapDetail(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    const body = await error.response.json<{ detail?: string }>().catch(() => null);
    throw new MemberActionError(body?.detail ?? 'No se pudo completar la acción.');
  }
  throw error;
}

export function getMembers(storeId: number): Promise<OrganizationMemberRead[]> {
  return httpClient.get(`b2b/organizations/${storeId}/members`).json<OrganizationMemberRead[]>();
}

export async function inviteMember(
  storeId: number,
  payload: OrganizationMemberInvite,
): Promise<OrganizationMemberRead> {
  try {
    return await httpClient
      .post(`b2b/organizations/${storeId}/members`, { json: payload })
      .json<OrganizationMemberRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function updateMember(
  storeId: number,
  memberId: number,
  payload: OrganizationMemberUpdate,
): Promise<OrganizationMemberRead> {
  try {
    return await httpClient
      .patch(`b2b/organizations/${storeId}/members/${memberId}`, { json: payload })
      .json<OrganizationMemberRead>();
  } catch (error) {
    return unwrapDetail(error);
  }
}

export async function removeMember(storeId: number, memberId: number): Promise<void> {
  try {
    await httpClient.delete(`b2b/organizations/${storeId}/members/${memberId}`);
  } catch (error) {
    await unwrapDetail(error);
  }
}
