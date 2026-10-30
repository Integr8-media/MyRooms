import { EXPENSE_CATEGORIES, isExpenseCategory, summarizeExpenses } from './expenses';

const rows = [
  { branch_id: 'A', category: 'rent', amount: 500_000, method: 'cash', spent_on: '2026-10-01' },
  {
    branch_id: 'A',
    category: 'electricity',
    amount: 250_000,
    method: 'instapay',
    spent_on: '2026-10-30',
  },
  // Synced from Postgres with a time part: still counted on its date.
  {
    branch_id: 'B',
    category: 'snacks',
    amount: 80_000,
    method: 'visa',
    spent_on: '2026-10-15T00:00:00',
  },
  { branch_id: 'A', category: 'parties', amount: 1_000, method: 'cheque', spent_on: '2026-10-20' },
  // Outside the month.
  { branch_id: 'A', category: 'rent', amount: 999, method: 'cash', spent_on: '2026-11-01' },
  { branch_id: 'A', category: 'rent', amount: 999, method: 'cash', spent_on: null },
];

const october = { fromDate: '2026-10-01', toDate: '2026-10-31' };

describe('expenses', () => {
  it('match the database list of categories', () => {
    expect(EXPENSE_CATEGORIES).toContain('other');
    expect(isExpenseCategory('electricity')).toBe(true);
    expect(isExpenseCategory('parties')).toBe(false);
  });

  it('add up the period by category and method (both days included)', () => {
    const s = summarizeExpenses(rows, october);
    expect(s.total).toBe(500_000 + 250_000 + 80_000 + 1_000);
    expect(s.count).toBe(4);
    expect(s.byCategory.rent).toBe(500_000);
    expect(s.byCategory.electricity).toBe(250_000);
    expect(s.byCategory.snacks).toBe(80_000);
    // Unknown category and method fall back to "other" and cash.
    expect(s.byCategory.other).toBe(1_000);
    expect(s.byMethod).toEqual({ cash: 501_000, visa: 80_000, instapay: 250_000 });
  });

  it('can be limited to one branch', () => {
    expect(summarizeExpenses(rows, october, 'B').total).toBe(80_000);
    expect(
      summarizeExpenses(rows, { fromDate: '2026-10-30', toDate: '2026-10-30' }, 'A').total,
    ).toBe(250_000);
  });
});
