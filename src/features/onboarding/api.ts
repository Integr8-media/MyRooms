import type { Role } from '@/domain/permissions';
import { getSupabase } from '@/lib/supabase/client';

/** Online calls used before the user belongs to an organization. */

export async function createOrganization(name: string, branchName: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_organization', {
    p_name: name,
    p_branch_name: branchName,
    p_timezone: 'Africa/Cairo',
  });
  if (error) throw error;
  return data as string;
}

export type PendingInvitation = {
  id: string;
  org_id: string;
  org_name: string;
  role: Role;
  expires_at: string;
};

export async function fetchMyInvitations(): Promise<PendingInvitation[]> {
  const { data, error } = await getSupabase().rpc('my_invitations');
  if (error) throw error;
  return (data ?? []) as PendingInvitation[];
}

export async function acceptInvitation(id: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('accept_invitation', { p_invitation_id: id });
  if (error) throw error;
  return data as string;
}

export async function declineInvitation(id: string) {
  const { error } = await getSupabase().from('invitations').delete().eq('id', id);
  if (error) throw error;
}
