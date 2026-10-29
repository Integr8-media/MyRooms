import { useQuery, useStatus } from '@powersync/react';
import { createContext, use, type ReactNode } from 'react';

import { can, isRole, type Permission, type Role } from '@/domain/permissions';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { BranchRow, MembershipRow, OrganizationRow } from '@/lib/powersync/schema';
import { useWorkspaceStore } from '@/lib/settings/workspace-store';

export type MembershipWithOrg = MembershipRow & { org_name: string };

export type Features = { customers: boolean; snacks: boolean; expenses: boolean };

export type Workspace = {
  /** loading: first sync not finished yet. none: no organization (onboarding). */
  status: 'loading' | 'none' | 'ready';
  userId: string | null;
  memberships: MembershipWithOrg[];
  membership: MembershipWithOrg | null;
  role: Role | null;
  org: OrganizationRow | null;
  /** Branches this user works in (owners: all, including inactive ones). */
  branches: BranchRow[];
  /** The branch this device is working in. */
  branch: BranchRow | null;
  /** Optional modules switched on for the organization (default on). */
  features: Features;
  can: (permission: Permission) => boolean;
};

const WorkspaceContext = createContext<Workspace | null>(null);

/** Loads the signed-in user's organizations, role and branches from the local database. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, session } = useAuth();
  const userId = session?.user.id ?? null;
  const sync = useStatus();
  const storedOrgId = useWorkspaceStore((s) => s.orgId);
  const storedBranchId = useWorkspaceStore((s) => s.branchId);

  const { data: memberships, isLoading } = useQuery<MembershipWithOrg>(
    `SELECT m.*, o.name AS org_name FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ? ORDER BY o.name`,
    [userId],
  );
  const membership = memberships.find((m) => m.org_id === storedOrgId) ?? memberships[0] ?? null;
  const orgId = membership?.org_id ?? null;
  const role = isRole(membership?.role) ? membership.role : null;

  const { data: orgs } = useQuery<OrganizationRow>('SELECT * FROM organizations WHERE id = ?', [
    orgId,
  ]);
  const org = orgs[0] ?? null;

  const { data: branches } = useQuery<BranchRow>(
    `SELECT b.* FROM branches b
      WHERE b.org_id = ?
        AND (? = 'owner' OR b.id IN (SELECT branch_id FROM member_branches WHERE membership_id = ?))
      ORDER BY b.is_active DESC, b.name`,
    [orgId, role, membership?.id ?? null],
  );
  const activeBranches = branches.filter((b) => b.is_active);
  const branch = activeBranches.find((b) => b.id === storedBranchId) ?? activeBranches[0] ?? null;

  let status: Workspace['status'] = 'ready';
  if (authStatus !== 'signedIn' || isLoading || (!membership && !sync.hasSynced)) {
    status = 'loading';
  } else if (!membership || !org) {
    status = sync.hasSynced ? 'none' : 'loading';
  }

  const value: Workspace = {
    status,
    userId,
    memberships,
    membership,
    role,
    org,
    branches,
    branch,
    features: {
      customers: org?.feature_customers !== 0,
      snacks: org?.feature_snacks !== 0,
      expenses: org?.feature_expenses !== 0,
    },
    can: (permission) => can(role, permission),
  };

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace(): Workspace {
  const value = use(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return value;
}
