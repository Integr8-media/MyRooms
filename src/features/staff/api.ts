import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Role } from '@/domain/permissions';
import { authRedirectUrl } from '@/lib/auth/redirect';
import { powersync } from '@/lib/powersync/database';
import type { MembershipRow } from '@/lib/powersync/schema';
import { getSupabase } from '@/lib/supabase/client';

export type InviteInput = { orgId: string; email: string; role: Role; branchIds: string[] };

/**
 * Creates the invitation (online). The `invite-staff` Edge Function also emails
 * people who have no account yet. If the function isn't deployed or can't be
 * reached, the invitation is saved directly and `emailSent` is false: the person
 * signs up with that email and sees the invitation in the app.
 */
export async function inviteMember(input: InviteInput): Promise<{ emailSent: boolean }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke<{ email_sent: boolean }>('invite-staff', {
    body: {
      org_id: input.orgId,
      email: input.email,
      role: input.role,
      branch_ids: input.branchIds,
      redirect_to: authRedirectUrl('/set-password'),
    },
  });
  if (!error) return { emailSent: !!data?.email_sent };

  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    // The function ran and the database refused (e.g. not_allowed): report that.
    if (body?.error) throw { message: body.error };
  }

  const { error: rpcError } = await supabase.rpc('invite_member', {
    p_org_id: input.orgId,
    p_email: input.email,
    p_role: input.role,
    p_branch_ids: input.branchIds,
  });
  if (rpcError) throw rpcError;
  return { emailSent: false };
}

// Local writes below; PowerSync uploads them and the database checks permissions.

export async function revokeInvitation(id: string) {
  await powersync.execute('DELETE FROM invitations WHERE id = ?', [id]);
}

export async function setMemberRole(membershipId: string, role: Role) {
  await powersync.execute('UPDATE memberships SET role = ? WHERE id = ?', [role, membershipId]);
}

export async function assignBranch(member: MembershipRow, branchId: string) {
  await powersync.execute(
    `INSERT INTO member_branches (id, membership_id, branch_id, org_id, user_id, created_at)
     VALUES (uuid(), ?, ?, ?, ?, ?)`,
    [member.id, branchId, member.org_id, member.user_id, new Date().toISOString()],
  );
}

export async function unassignBranch(memberBranchId: string) {
  await powersync.execute('DELETE FROM member_branches WHERE id = ?', [memberBranchId]);
}

export async function removeMember(membershipId: string) {
  await powersync.writeTransaction(async (tx) => {
    // The server cascades; mirror it locally so the list updates while offline.
    await tx.execute('DELETE FROM member_branches WHERE membership_id = ?', [membershipId]);
    await tx.execute('DELETE FROM memberships WHERE id = ?', [membershipId]);
  });
}
