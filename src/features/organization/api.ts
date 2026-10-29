import { powersync } from '@/lib/powersync/database';

/** Local writes; PowerSync uploads them when online. Owners only (enforced by RLS). */

export async function updateOrganization(id: string, values: { name: string; timezone: string }) {
  await powersync.execute('UPDATE organizations SET name = ?, timezone = ? WHERE id = ?', [
    values.name,
    values.timezone,
    id,
  ]);
}

export type Feature = 'customers' | 'snacks' | 'expenses';

const FEATURE_COLUMNS: Record<Feature, string> = {
  customers: 'feature_customers',
  snacks: 'feature_snacks',
  expenses: 'feature_expenses',
};

export async function setFeature(id: string, feature: Feature, enabled: boolean) {
  await powersync.execute(`UPDATE organizations SET ${FEATURE_COLUMNS[feature]} = ? WHERE id = ?`, [
    enabled ? 1 : 0,
    id,
  ]);
}
