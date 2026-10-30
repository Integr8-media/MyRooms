import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { searchCustomers } from '@/domain/items';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Button, Card, ListRow, Notice, Screen, ScreenHeader, Text, TextField } from '@/ui';

import { useCustomers } from './data';

/** The organization's customers, searchable by phone or name. */
export function CustomersScreen() {
  const { t } = useTranslation();
  const { org, can, features } = useWorkspace();
  const customers = useCustomers(org?.id);
  const [query, setQuery] = useState('');
  const shown = query.trim() ? searchCustomers(customers, query, 50) : customers;
  const open = (id: string) => router.push({ pathname: '/customers/[id]', params: { id } });

  if (!features.customers) {
    return (
      <Screen>
        <ScreenHeader title={t('customers.title')} />
        <Notice tone="info" message={t('modules.off')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t('customers.title')}
        actions={
          can('customers.manage') ? (
            <Button label={t('customers.add')} onPress={() => open('new')} testID="add-customer" />
          ) : null
        }
      />
      <TextField
        label={t('customers.search')}
        placeholder={t('customers.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        testID="customers-search"
      />
      <Card className="gap-1">
        {shown.length === 0 ? (
          <Text variant="muted">
            {query.trim() ? t('customers.noMatch') : t('customers.empty')}
          </Text>
        ) : null}
        {shown.map((c) => (
          <ListRow
            key={c.id}
            title={c.name ?? ''}
            subtitle={c.phone}
            trailing={
              !c.is_active ? (
                <Badge label={t('customers.hidden')} />
              ) : c.default_discount_pct ? (
                <Badge
                  label={t('customers.discountBadge', { percent: c.default_discount_pct })}
                  tone="success"
                />
              ) : null
            }
            onPress={() => open(c.id)}
            testID={`customer-row-${c.id}`}
          />
        ))}
      </Card>
    </Screen>
  );
}
