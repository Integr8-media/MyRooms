import type { Transaction } from '@powersync/common';

import { netPaid } from '@/domain/billing';
import { adjustmentFor, itemsTotal, MAX_ITEM_QUANTITY } from '@/domain/items';
import type { Piasters } from '@/domain/money';
import { fail, iso } from '@/features/sessions/api';
import { powersync } from '@/lib/powersync/database';

/**
 * Snacks & drinks writes go to the local database first and sync when online. The server runs
 * the same checks (supabase/migrations, phase 7), sets each item's name and price from the
 * product, and keeps the bill's items_amount. The device never updates bills.items_amount
 * (clients may not write amounts): screens add up the local session_items instead.
 */

export type ProductInput = {
  name: string;
  category: string | null;
  price: Piasters;
  trackStock: boolean;
  lowStockAt: number | null;
};

/** Owners only (checked by the server too). Returns the product id. */
export async function saveProduct(orgId: string, id: string | null, values: ProductInput) {
  return powersync.writeTransaction(async (tx) => {
    if (id) {
      await tx.execute(
        `UPDATE products SET name = ?, category = ?, price = ?, track_stock = ?, low_stock_at = ?
          WHERE id = ?`,
        [
          values.name,
          values.category,
          values.price,
          values.trackStock ? 1 : 0,
          values.lowStockAt,
          id,
        ],
      );
      return id;
    }
    const { id: newId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    const { next } = await tx.get<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM products WHERE org_id = ?',
      [orgId],
    );
    const now = iso(Date.now());
    await tx.execute(
      `INSERT INTO products (id, org_id, name, category, price, track_stock, low_stock_at,
         sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        newId,
        orgId,
        values.name,
        values.category,
        values.price,
        values.trackStock ? 1 : 0,
        values.lowStockAt,
        next,
        now,
        now,
      ],
    );
    return newId;
  });
}

/** Products are switched off, never deleted (sold items point at them). */
export async function setProductActive(id: string, active: boolean) {
  await powersync.execute('UPDATE products SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

type SessionState = {
  id: string;
  org_id: string;
  branch_id: string;
  status: string;
  bill_status: string | null;
};

async function sessionState(tx: Transaction, sessionId: string) {
  const session = await tx.getOptional<SessionState>(
    `SELECT x.id, x.org_id, x.branch_id, x.status, b.status AS bill_status
       FROM sessions x LEFT JOIN bills b ON b.id = x.id
      WHERE x.id = ?`,
    [sessionId],
  );
  return session ?? fail('invalid_session');
}

/**
 * Sell `quantity` of a product in a session: while it runs, or after it ended until the bill
 * is void (e.g. a drink bought at checkout). Returns the new item id.
 */
export async function addItem(
  sessionId: string,
  productId: string,
  quantity: number,
  now = Date.now(),
): Promise<string> {
  return powersync.writeTransaction(async (tx) => {
    const session = await sessionState(tx, sessionId);
    if (session.status !== 'active' && session.status !== 'completed') fail('session_closed');
    if (session.bill_status === 'void') fail('bill_void');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      fail('invalid_quantity');
    }
    const product = await tx.getOptional<{ name: string | null; price: number | null }>(
      'SELECT name, price FROM products WHERE id = ? AND org_id = ?',
      [productId, session.org_id],
    );
    if (!product) return fail('invalid_product');

    const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    await tx.execute(
      `INSERT INTO session_items (id, org_id, branch_id, session_id, product_id, name, quantity,
         unit_price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.org_id,
        session.branch_id,
        sessionId,
        productId,
        product.name ?? '',
        quantity,
        product.price ?? 0,
        iso(now),
        iso(now),
      ],
    );
    return id;
  });
}

/**
 * Take an item off (it goes back into stock). While the session runs: anyone in the branch.
 * After it ended: owners and managers (the screen only offers it to them), before any payment,
 * and never below the bill's discount. The server checks the same.
 */
export async function removeItem(itemId: string) {
  await powersync.writeTransaction(async (tx) => {
    const item = await tx.getOptional<{ session_id: string; quantity: number; unit_price: number }>(
      'SELECT session_id, quantity, unit_price FROM session_items WHERE id = ?',
      [itemId],
    );
    if (!item) return;
    const session = await sessionState(tx, item.session_id);
    if (session.status !== 'active') {
      if (session.status !== 'completed') fail('session_closed');
      if (session.bill_status === 'void') fail('bill_void');
      const bill = await tx.getOptional<{ time_amount: number; discount_amount: number }>(
        'SELECT time_amount, discount_amount FROM bills WHERE id = ?',
        [session.id],
      );
      if (bill) {
        const payments = await tx.getAll<{ kind: string; amount: number }>(
          'SELECT kind, amount FROM payments WHERE bill_id = ?',
          [session.id],
        );
        if (netPaid(payments) !== 0) fail('bill_has_payments');
        const items = await tx.getAll<{ quantity: number; unit_price: number }>(
          'SELECT quantity, unit_price FROM session_items WHERE session_id = ? AND id <> ?',
          [session.id, itemId],
        );
        if ((bill.discount_amount ?? 0) > (bill.time_amount ?? 0) + itemsTotal(items)) {
          fail('invalid_discount');
        }
      }
    }
    await tx.execute('DELETE FROM session_items WHERE id = ?', [itemId]);
  });
}

type StockTarget = { orgId: string; branchId: string; productId: string };

async function insertMovement(
  tx: Transaction,
  target: StockTarget,
  quantity: number,
  reason: 'purchase' | 'adjustment',
  note: string | null,
) {
  const now = iso(Date.now());
  await tx.execute(
    `INSERT INTO stock_movements (id, org_id, branch_id, product_id, quantity, reason, note,
       created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [target.orgId, target.branchId, target.productId, quantity, reason, note, now, now],
  );
}

/** Owners and managers: add stock that was bought. */
export async function restock(target: StockTarget, quantity: number, note: string | null) {
  if (!Number.isInteger(quantity) || quantity < 1) fail('invalid_quantity');
  await powersync.writeTransaction((tx) => insertMovement(tx, target, quantity, 'purchase', note));
}

/**
 * Owners and managers: set the stock to what was counted. Saves the difference as a
 * correction (nothing if the count matches). Returns the difference.
 */
export async function countStock(
  target: StockTarget,
  counted: number,
  note: string | null,
): Promise<number> {
  if (!Number.isInteger(counted) || counted < 0) fail('invalid_quantity');
  return powersync.writeTransaction(async (tx) => {
    const { stock } = await tx.get<{ stock: number | null }>(
      `SELECT COALESCE((SELECT SUM(quantity) FROM stock_movements
                         WHERE product_id = ? AND branch_id = ?), 0)
            - COALESCE((SELECT SUM(quantity) FROM session_items
                         WHERE product_id = ? AND branch_id = ?), 0) AS stock`,
      [target.productId, target.branchId, target.productId, target.branchId],
    );
    const difference = adjustmentFor(stock ?? 0, counted);
    if (difference !== 0) await insertMovement(tx, target, difference, 'adjustment', note);
    return difference;
  });
}
