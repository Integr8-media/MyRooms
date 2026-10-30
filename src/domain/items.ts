/**
 * Snacks & drinks and customers (Phase 7). Pure TypeScript: no React, no database.
 *
 * - Items sold in a session are added to its bill (the server keeps bills.items_amount; the
 *   device adds up its local session_items rows so offline sales show at once).
 * - Stock in a branch = restocks and corrections (stock_movements) - items sold (session_items).
 *   Sales are not stock movements, so a sale made offline can never be counted twice.
 * - A customer's default discount is applied when the bill is made (same rule as
 *   public.create_bill() in the Phase 7 migration).
 */
import { percentDiscount } from './billing';
import type { Piasters } from './money';

type Nullable<T> = T | null | undefined;

export type ItemLike = { quantity: Nullable<number>; unit_price: Nullable<number> };

/** What the items come to. */
export function itemsTotal(items: readonly ItemLike[]): Piasters {
  return items.reduce((sum, i) => sum + (i.quantity ?? 0) * (i.unit_price ?? 0), 0);
}

/** Most of one product that can be added at once (as in the database check). */
export const MAX_ITEM_QUANTITY = 1000;

export type ItemLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: Piasters;
  amount: Piasters;
};

/**
 * Items grouped by product and price, in the order first sold (for the bill and receipt):
 * "Cola × 3" rather than three rows.
 */
export function groupItems(
  items: readonly (ItemLike & { product_id: Nullable<string>; name: Nullable<string> })[],
): ItemLine[] {
  const lines = new Map<string, ItemLine>();
  for (const item of items) {
    const unitPrice = item.unit_price ?? 0;
    const quantity = item.quantity ?? 0;
    const key = `${item.product_id ?? ''}|${unitPrice}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += quantity;
      line.amount += quantity * unitPrice;
    } else {
      lines.set(key, {
        productId: item.product_id ?? '',
        name: item.name ?? '',
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
      });
    }
  }
  return [...lines.values()];
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export type StockState = 'untracked' | 'ok' | 'low' | 'out';

export function stockState(
  product: { track_stock: Nullable<number | boolean>; low_stock_at: Nullable<number> },
  level: number,
): StockState {
  if (!product.track_stock) return 'untracked';
  if (level <= 0) return 'out';
  if (product.low_stock_at != null && level <= product.low_stock_at) return 'low';
  return 'ok';
}

/** The movement that brings the stock from `current` to a counted `counted` (0 = none needed). */
export function adjustmentFor(current: number, counted: number): number {
  return counted - current;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/** bills.discount_reason for a customer's default discount, e.g. "customer:10". */
const CUSTOMER_DISCOUNT = /^customer:(\d{1,3})$/;

export function customerDiscountReason(percent: number): string {
  return `customer:${percent}`;
}

/** The percent of a customer's default discount, or null for a manual discount. */
export function parseCustomerDiscount(reason: Nullable<string>): number | null {
  const match = reason ? CUSTOMER_DISCOUNT.exec(reason) : null;
  return match ? Number(match[1]) : null;
}

/** The discount a customer's default percent gives on a subtotal (0 for none). */
export function customerDiscount(subtotal: Piasters, percent: Nullable<number>): Piasters {
  return percent && percent > 0 ? percentDiscount(subtotal, percent) : 0;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/**
 * Digits only, Arabic-Indic digits turned into 0-9, and an Egyptian country code (+20 / 0020)
 * turned into the local leading 0, so "+20 100 123 4567" and "01001234567" match.
 */
export function normalizePhone(phone: Nullable<string>): string {
  if (!phone) return '';
  let digits = phone
    .replace(ARABIC_DIGITS, (d) => {
      const code = d.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('20') && digits.length === 12) digits = `0${digits.slice(2)}`;
  return digits;
}

export type CustomerLike = {
  id: string;
  name: Nullable<string>;
  phone: Nullable<string>;
  is_active?: Nullable<number | boolean>;
};

/**
 * Customers matching a search by phone (3+ digits, anywhere in the number) or name (any part,
 * any case). Best matches first: same phone, then phone or name starting with the search.
 * Customers that were switched off are left out.
 */
export function searchCustomers<T extends CustomerLike>(
  customers: readonly T[],
  query: string,
  limit = 8,
): T[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return [];
  const digits = normalizePhone(query);
  const byPhone = digits.length >= 3 && digits.length >= text.replace(/[\s+()-]/g, '').length;
  const scored: { customer: T; score: number }[] = [];
  for (const customer of customers) {
    if (customer.is_active === 0 || customer.is_active === false) continue;
    let score = 0;
    if (byPhone) {
      const phone = normalizePhone(customer.phone);
      if (phone === digits) score = 3;
      else if (phone.startsWith(digits)) score = 2;
      else if (phone.includes(digits)) score = 1;
    } else {
      const name = (customer.name ?? '').toLocaleLowerCase();
      if (name.startsWith(text)) score = 2;
      else if (name.includes(text)) score = 1;
    }
    if (score) scored.push({ customer, score });
  }
  return scored
    .sort(
      (a, b) => b.score - a.score || (a.customer.name ?? '').localeCompare(b.customer.name ?? ''),
    )
    .slice(0, limit)
    .map((s) => s.customer);
}

/** Another active customer with the same phone (to warn before adding a duplicate). */
export function samePhone<T extends CustomerLike>(
  customers: readonly T[],
  phone: Nullable<string>,
  exceptId?: string | null,
): T | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return (
    customers.find(
      (c) =>
        c.id !== exceptId &&
        c.is_active !== 0 &&
        c.is_active !== false &&
        normalizePhone(c.phone) === digits,
    ) ?? null
  );
}
