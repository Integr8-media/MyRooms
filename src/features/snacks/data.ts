import { useQuery } from '@powersync/react';

import { stockState, type StockState } from '@/domain/items';
import type { ProductRow, SessionItemRow, StockMovementRow } from '@/lib/powersync/schema';

export type ProductWithStock = ProductRow & { stock: number; state: StockState };

/**
 * The organization's products with their stock in one branch:
 * restocks and corrections minus everything sold there (see src/domain/items.ts).
 */
export function useProducts(
  orgId: string | null | undefined,
  branchId: string | null | undefined,
): ProductWithStock[] {
  const { data } = useQuery<ProductRow & { stock: number | null }>(
    `SELECT p.*,
            COALESCE((SELECT SUM(m.quantity) FROM stock_movements m
                       WHERE m.product_id = p.id AND m.branch_id = ?), 0)
          - COALESCE((SELECT SUM(i.quantity) FROM session_items i
                       WHERE i.product_id = p.id AND i.branch_id = ?), 0) AS stock
       FROM products p
      WHERE p.org_id = ?
      ORDER BY p.is_active DESC, p.category, p.sort_order, p.name`,
    [branchId ?? null, branchId ?? null, orgId ?? null],
  );
  return data.map((p) => {
    const stock = p.stock ?? 0;
    return { ...p, stock, state: stockState(p, stock) };
  });
}

/** Products in the current branch that are running low or have run out. */
export function lowStock(products: readonly ProductWithStock[]): ProductWithStock[] {
  return products.filter((p) => p.is_active && (p.state === 'low' || p.state === 'out'));
}

export function useSessionItems(sessionId: string | null | undefined): SessionItemRow[] {
  return useQuery<SessionItemRow>(
    'SELECT * FROM session_items WHERE session_id = ? ORDER BY created_at, id',
    [sessionId ?? null],
  ).data;
}

export type MovementWithPerson = StockMovementRow & { person: string | null };

/** Latest restocks and corrections of a product in a branch. */
export function useStockMovements(
  productId: string | null | undefined,
  branchId: string | null | undefined,
): MovementWithPerson[] {
  return useQuery<MovementWithPerson>(
    `SELECT m.*, COALESCE(x.display_name, x.email) AS person
       FROM stock_movements m
       LEFT JOIN memberships x ON x.user_id = m.created_by AND x.org_id = m.org_id
      WHERE m.product_id = ? AND m.branch_id = ?
      ORDER BY m.created_at DESC
      LIMIT 30`,
    [productId ?? null, branchId ?? null],
  ).data;
}
