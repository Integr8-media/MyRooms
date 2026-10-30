/**
 * Expenses (Phase 7). Pure TypeScript: no React, no database.
 *
 * An expense is money spent by a branch on a local date (spent_on, "YYYY-MM-DD" in the org's
 * time zone). Owners and managers record them; net profit (Phase 8) is income - expenses.
 */
import { PAYMENT_METHODS, isPaymentMethod, type PaymentMethod } from './billing';
import type { Piasters } from './money';

/** Same list as the check on public.expenses.category (Phase 7 migration). */
export const EXPENSE_CATEGORIES = [
  'rent',
  'salaries',
  'electricity',
  'internet',
  'maintenance',
  'supplies',
  'snacks',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
}

/** Largest single expense (10,000,000 EGP), as in the database check. */
export const MAX_EXPENSE: Piasters = 1_000_000_000;

type Nullable<T> = T | null | undefined;

export type ExpenseLike = {
  branch_id?: Nullable<string>;
  category: Nullable<string>;
  amount: Nullable<number>;
  method: Nullable<string>;
  spent_on: Nullable<string>;
};

export type ExpenseSummary = {
  total: Piasters;
  count: number;
  byCategory: Record<ExpenseCategory, Piasters>;
  byMethod: Record<PaymentMethod, Piasters>;
};

const zeros = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, Piasters>;

/**
 * Expenses from fromDate to toDate (local dates, both included), optionally for one branch.
 * Unknown categories count as 'other' and unknown methods as cash.
 */
export function summarizeExpenses(
  rows: readonly ExpenseLike[],
  range: { fromDate: string; toDate: string },
  branchId?: string | null,
): ExpenseSummary {
  const summary: ExpenseSummary = {
    total: 0,
    count: 0,
    byCategory: zeros(EXPENSE_CATEGORIES),
    byMethod: zeros(PAYMENT_METHODS),
  };
  for (const row of rows) {
    // Postgres dates sync as "YYYY-MM-DD"; keep only the date part to be safe.
    const date = row.spent_on?.slice(0, 10);
    if (!date || date < range.fromDate || date > range.toDate) continue;
    if (branchId && row.branch_id !== branchId) continue;
    const amount = row.amount ?? 0;
    summary.total += amount;
    summary.count += 1;
    summary.byCategory[isExpenseCategory(row.category) ? row.category : 'other'] += amount;
    summary.byMethod[isPaymentMethod(row.method) ? row.method : 'cash'] += amount;
  }
  return summary;
}
