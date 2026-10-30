import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { lowStock, useProducts } from '@/features/snacks/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Button } from '@/ui';

/**
 * Links to the optional modules switched on for the organization (customers, snacks & stock,
 * expenses). A module that is off is not shown anywhere; its data is kept.
 */
export function ModuleLinks() {
  const { t } = useTranslation();
  const { org, branch, can, features } = useWorkspace();
  const products = useProducts(features.snacks ? org?.id : null, branch?.id);
  const low = lowStock(products).length;
  const showExpenses = features.expenses && can('expenses.manage');

  if (!features.customers && !features.snacks && !showExpenses) return null;
  return (
    <View className="flex-row flex-wrap gap-2" testID="module-links">
      {features.customers ? (
        <Button
          label={t('customers.title')}
          variant="secondary"
          onPress={() => router.push('/customers')}
          testID="open-customers"
        />
      ) : null}
      {features.snacks ? (
        <Button
          label={low ? t('snacks.titleLow', { count: low }) : t('snacks.title')}
          variant="secondary"
          onPress={() => router.push('/products')}
          testID="open-products"
        />
      ) : null}
      {showExpenses ? (
        <Button
          label={t('expenses.title')}
          variant="secondary"
          onPress={() => router.push('/expenses')}
          testID="open-expenses"
        />
      ) : null}
    </View>
  );
}
