import { can, canAssignBranch, invitableRoles, isRole, needsBranches } from './permissions';

describe('permissions', () => {
  it('only owners change organization settings, prices and roles', () => {
    for (const permission of ['org.settings', 'prices.edit', 'staff.changeRole'] as const) {
      expect(can('owner', permission)).toBe(true);
      expect(can('manager', permission)).toBe(false);
      expect(can('cashier', permission)).toBe(false);
    }
  });

  it('cashiers cannot see income, staff or edit branches', () => {
    expect(can('cashier', 'income.view')).toBe(false);
    expect(can('cashier', 'staff.view')).toBe(false);
    expect(can('cashier', 'branches.edit')).toBe(false);
    expect(can('manager', 'income.view')).toBe(true);
  });

  it('owners and managers set up stations; only owners set prices', () => {
    expect(can('owner', 'stations.edit')).toBe(true);
    expect(can('manager', 'stations.edit')).toBe(true);
    expect(can('cashier', 'stations.edit')).toBe(false);
    expect(can('manager', 'prices.edit')).toBe(false);
  });

  it('no role means no permissions', () => {
    expect(can(null, 'staff.view')).toBe(false);
    expect(can(undefined, 'branches.edit')).toBe(false);
  });

  it('limits who can be invited', () => {
    expect(invitableRoles('owner')).toEqual(['owner', 'manager', 'cashier']);
    expect(invitableRoles('manager')).toEqual(['cashier']);
    expect(invitableRoles('cashier')).toEqual([]);
  });

  it('managers assign only cashiers, only in their branches', () => {
    expect(canAssignBranch('owner', 'manager', false)).toBe(true);
    expect(canAssignBranch('manager', 'cashier', true)).toBe(true);
    expect(canAssignBranch('manager', 'cashier', false)).toBe(false);
    expect(canAssignBranch('manager', 'manager', true)).toBe(false);
    expect(canAssignBranch('cashier', 'cashier', true)).toBe(false);
  });

  it('owners need no branch assignments', () => {
    expect(needsBranches('owner')).toBe(false);
    expect(needsBranches('cashier')).toBe(true);
  });

  it('recognises role strings from the database', () => {
    expect(isRole('manager')).toBe(true);
    expect(isRole('admin')).toBe(false);
  });
});
