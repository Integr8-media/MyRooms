/**
 * What each role may do. This decides what the app shows; the database (RLS
 * policies in supabase/migrations) enforces the same rules, so keep them in step.
 */
export const ROLES = ['owner', 'manager', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

const RULES = {
  /** Organization name, time zone, feature toggles. */
  'org.settings': ['owner'],
  'branches.create': ['owner'],
  /** Managers: only branches they are assigned to. */
  'branches.edit': ['owner', 'manager'],
  'staff.view': ['owner', 'manager'],
  /** Managers: cashiers only, to their own branches. */
  'staff.invite': ['owner', 'manager'],
  'staff.changeRole': ['owner'],
  'staff.remove': ['owner'],
  /** Station types, rate rules and hour packages. */
  'prices.edit': ['owner'],
  /** Add/edit stations and switch maintenance on/off. Managers: only their branches. */
  'stations.edit': ['owner', 'manager'],
  // Used from Phase 5 onwards.
  'income.view': ['owner', 'manager'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof RULES;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (RULES[permission] as readonly Role[]).includes(role);
}

/** Roles this person may invite. */
export function invitableRoles(role: Role | null | undefined): Role[] {
  if (role === 'owner') return [...ROLES];
  if (role === 'manager') return ['cashier'];
  return [];
}

/**
 * May `actor` add/remove `target` to/from a branch?
 * Owners: anyone. Managers: cashiers, in branches they manage.
 */
export function canAssignBranch(
  actor: Role | null | undefined,
  target: Role,
  actorManagesBranch: boolean,
): boolean {
  if (actor === 'owner') return true;
  return actor === 'manager' && target === 'cashier' && actorManagesBranch;
}

/** Owners work in every branch, so they have no branch assignments. */
export function needsBranches(role: Role): boolean {
  return role !== 'owner';
}
