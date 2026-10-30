import { fail, iso } from '@/features/sessions/api';
import { powersync } from '@/lib/powersync/database';

/**
 * Customer writes go to the local database first and sync when online. Only owners and
 * managers may set a default discount (the server checks it too, see the phase 7 migration).
 */

export type CustomerInput = {
  name: string;
  phone: string | null;
  notes: string | null;
  /** Default discount in percent. Left out when the user may not change it. */
  discount?: number;
};

/** Add (id null) or edit a customer. Returns the customer id. */
export async function saveCustomer(
  orgId: string,
  id: string | null,
  values: CustomerInput,
): Promise<string> {
  return powersync.writeTransaction(async (tx) => {
    if (id) {
      await tx.execute('UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?', [
        values.name,
        values.phone,
        values.notes,
        id,
      ]);
      if (values.discount !== undefined) {
        await tx.execute(
          'UPDATE customers SET default_discount_pct = ? WHERE id = ? AND default_discount_pct IS NOT ?',
          [values.discount, id, values.discount],
        );
      }
      return id;
    }
    const { id: newId } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    const now = iso(Date.now());
    await tx.execute(
      `INSERT INTO customers (id, org_id, name, phone, notes, default_discount_pct, is_active,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [newId, orgId, values.name, values.phone, values.notes, values.discount ?? 0, now, now],
    );
    return newId;
  });
}

/** Customers are switched off, never deleted (sessions point at them). */
export async function setCustomerActive(id: string, active: boolean) {
  await powersync.execute('UPDATE customers SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

/**
 * Link a running session or a reservation to a customer (or unlink it). Their name and phone are
 * copied onto the session too, so the floor, calendar and receipt can show them.
 */
export async function setSessionCustomer(sessionId: string, customerId: string | null) {
  await powersync.writeTransaction(async (tx) => {
    const session = await tx.getOptional<{ org_id: string; status: string }>(
      'SELECT org_id, status FROM sessions WHERE id = ?',
      [sessionId],
    );
    if (!session) return fail('invalid_session');
    if (session.status !== 'active' && session.status !== 'reserved') fail('session_closed');
    if (!customerId) {
      await tx.execute('UPDATE sessions SET customer_id = NULL WHERE id = ?', [sessionId]);
      return;
    }
    const customer = await tx.getOptional<{ name: string | null; phone: string | null }>(
      'SELECT name, phone FROM customers WHERE id = ? AND org_id = ?',
      [customerId, session.org_id],
    );
    if (!customer) return fail('invalid_customer');
    await tx.execute(
      'UPDATE sessions SET customer_id = ?, customer_name = ?, customer_phone = ? WHERE id = ?',
      [customerId, customer.name, customer.phone, sessionId],
    );
  });
}
