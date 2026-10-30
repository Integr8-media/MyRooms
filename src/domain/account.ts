/**
 * "Delete my account": what happens to each of the person's organizations.
 * Mirrors public.delete_account() (supabase/migrations/…_phase10_delete_account.sql), which has
 * the final say. Owners sync every membership of their organizations, so the device can tell.
 */

export type MembershipLite = { org_id: string; user_id: string; role: string };

export type AccountDeletionPlan = {
  /** Only owner while others remain: deletion is refused until someone else is owner. */
  blocked: string[];
  /** Only member: the organization and all its data are deleted. */
  deleted: string[];
  /** Others stay: only this person's membership goes. */
  left: string[];
};

export function accountDeletionPlan(
  userId: string,
  memberships: readonly MembershipLite[],
): AccountDeletionPlan {
  const plan: AccountDeletionPlan = { blocked: [], deleted: [], left: [] };
  const mine = memberships.filter((m) => m.user_id === userId);
  for (const own of mine) {
    const others = memberships.filter((m) => m.org_id === own.org_id && m.user_id !== userId);
    if (others.length === 0) plan.deleted.push(own.org_id);
    else if (own.role === 'owner' && !others.some((m) => m.role === 'owner')) {
      plan.blocked.push(own.org_id);
    } else plan.left.push(own.org_id);
  }
  return plan;
}
