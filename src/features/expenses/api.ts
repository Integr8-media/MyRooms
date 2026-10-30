import type { PaymentMethod } from '@/domain/billing';
import type { ExpenseCategory } from '@/domain/expenses';
import type { Piasters } from '@/domain/money';
import { iso } from '@/features/sessions/api';
import { powersync } from '@/lib/powersync/database';

/**
 * Expense writes go to the local database first and sync when online. Owners and the branch's
 * managers only (the server checks it too). Every change is audited on the server.
 */

export type ExpenseInput = {
  category: ExpenseCategory;
  amount: Piasters;
  method: PaymentMethod;
  /** Local date "YYYY-MM-DD". */
  date: string;
  note: string | null;
};

export async function createExpense(orgId: string, branchId: string, values: ExpenseInput) {
  const now = iso(Date.now());
  await powersync.execute(
    `INSERT INTO expenses (id, org_id, branch_id, category, amount, method, spent_on, note,
       created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      branchId,
      values.category,
      values.amount,
      values.method,
      values.date,
      values.note,
      now,
      now,
    ],
  );
}

export async function updateExpense(id: string, values: ExpenseInput) {
  await powersync.execute(
    'UPDATE expenses SET category = ?, amount = ?, method = ?, spent_on = ?, note = ? WHERE id = ?',
    [values.category, values.amount, values.method, values.date, values.note, id],
  );
}

export async function deleteExpense(id: string) {
  await powersync.execute('DELETE FROM expenses WHERE id = ?', [id]);
}
