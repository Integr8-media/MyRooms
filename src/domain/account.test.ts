import { accountDeletionPlan } from './account';

const m = (org_id: string, user_id: string, role: string) => ({ org_id, user_id, role });

describe('accountDeletionPlan', () => {
  it('deletes organizations where the person is the only member', () => {
    expect(accountDeletionPlan('me', [m('solo', 'me', 'owner')])).toEqual({
      blocked: [],
      deleted: ['solo'],
      left: [],
    });
  });

  it('blocks when the person is the only owner and others remain', () => {
    const plan = accountDeletionPlan('me', [
      m('arena', 'me', 'owner'),
      m('arena', 'ca', 'cashier'),
      m('arena', 'mg', 'manager'),
    ]);
    expect(plan.blocked).toEqual(['arena']);
    expect(plan.deleted).toEqual([]);
  });

  it('lets one of two owners leave, and staff leave', () => {
    const plan = accountDeletionPlan('me', [
      m('pair', 'me', 'owner'),
      m('pair', 'other', 'owner'),
      m('shop', 'me', 'cashier'),
      m('shop', 'boss', 'owner'),
    ]);
    expect(plan).toEqual({ blocked: [], deleted: [], left: ['pair', 'shop'] });
  });

  it('has nothing to do for someone with no organization', () => {
    expect(accountDeletionPlan('me', [m('x', 'someone', 'owner')])).toEqual({
      blocked: [],
      deleted: [],
      left: [],
    });
  });
});
