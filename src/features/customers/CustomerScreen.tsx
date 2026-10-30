import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { samePhone } from '@/domain/items';
import { formatMoney } from '@/domain/money';
import { customerSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { localDateTime } from '@/features/income/format';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { CustomerRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Badge, Button, Card, ListRow, Notice, Screen, ScreenHeader, Text, TextField } from '@/ui';

import { saveCustomer, setCustomerActive } from './api';
import { useCustomer, useCustomers, useCustomerVisits } from './data';

/** `/customers/new` or `/customers/<id>`: details, default discount and visit history. */
export function CustomerScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const customer = useCustomer(isNew ? null : id);

  if (!isNew && !customer) {
    return (
      <Screen>
        <ScreenHeader title={t('customers.title')} />
        <Notice tone="warning" message={t('customers.notFound')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={customer?.name ?? t('customers.add')} />
      <CustomerForm key={customer?.id ?? 'new'} customer={customer ?? null} />
      {customer ? <Visits customerId={customer.id} /> : null}
    </Screen>
  );
}

type Fields = { name: string; phone: string; notes: string; discount: string };

function CustomerForm({ customer }: { customer: CustomerRow | null }) {
  const { t } = useTranslation();
  const { org, can } = useWorkspace();
  const customers = useCustomers(org?.id);
  const editable = can('customers.manage');
  const canDiscount = can('customers.discount');
  const { busy, error, run } = useAsyncAction();
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<Fields>({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    notes: customer?.notes ?? '',
    discount: String(customer?.default_discount_pct ?? 0),
  });
  const [errors, setErrors] = useState<FieldErrors<Fields>>({});
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const err = (key: keyof Fields) => errors[key] && t(`validation.${errors[key]}`);
  const duplicate = samePhone(customers, values.phone, customer?.id);

  const save = async () => {
    const result = validate(customerSchema, values);
    setErrors(result.errors);
    setSaved(false);
    if (!result.ok || !org) return;
    const { discount, ...rest } = result.data;
    let newId: string | null = null;
    const ok = await run(async () => {
      newId = await saveCustomer(org.id, customer?.id ?? null, {
        ...rest,
        ...(canDiscount ? { discount } : {}),
      });
    });
    if (!ok) return;
    if (customer) setSaved(true);
    else if (newId) router.replace({ pathname: '/customers/[id]', params: { id: newId } });
  };

  return (
    <Card className="gap-4">
      <TextField
        label={t('customers.name')}
        value={values.name}
        onChangeText={set('name')}
        editable={editable}
        error={err('name')}
        testID="customer-name"
      />
      <TextField
        label={t('customers.phone')}
        value={values.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        inputMode="tel"
        editable={editable}
        error={err('phone')}
        testID="customer-phone"
      />
      {duplicate ? (
        <Notice
          tone="warning"
          message={t('customers.samePhone', { name: duplicate.name ?? '' })}
          testID="customer-duplicate"
        />
      ) : null}
      <TextField
        label={t('customers.notes')}
        value={values.notes}
        onChangeText={set('notes')}
        editable={editable}
        multiline
        error={err('notes')}
        testID="customer-notes"
      />
      <TextField
        label={t('customers.discount')}
        hint={canDiscount ? t('customers.discountHint') : t('customers.discountOwnerOnly')}
        value={values.discount}
        onChangeText={set('discount')}
        keyboardType="number-pad"
        inputMode="numeric"
        editable={editable && canDiscount}
        error={err('discount')}
        testID="customer-discount"
      />
      {saved ? <Notice tone="success" message={t('common.saved')} /> : null}
      <ErrorNotice error={error} />
      {editable ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t('common.save')}
            disabled={busy}
            onPress={() => void save()}
            testID="customer-save"
          />
          {customer ? (
            <Button
              label={customer.is_active ? t('customers.hide') : t('customers.show')}
              variant="secondary"
              disabled={busy}
              onPress={() => void run(() => setCustomerActive(customer.id, !customer.is_active))}
              testID="customer-active"
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Visits({ customerId }: { customerId: string }) {
  const { t, i18n } = useTranslation();
  const { org } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const visits = useCustomerVisits(customerId);
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const counted = visits.filter((v) => v.status === 'completed' && v.bill_status !== 'void');
  const spent = counted.reduce((sum, v) => sum + (v.total ?? 0), 0);

  return (
    <Card className="gap-1" testID="customer-visits">
      <Text variant="heading">{t('customers.history')}</Text>
      <Text testID="customer-spent">
        {t('customers.spent', { count: counted.length, amount: money(spent) })}
      </Text>
      {visits.length === 0 ? <Text variant="muted">{t('customers.noVisits')}</Text> : null}
      {visits.map((v) => {
        const status = v.status ?? 'completed';
        const open =
          status === 'reserved'
            ? () => router.push({ pathname: '/reservations/[id]', params: { id: v.id } })
            : status === 'completed'
              ? () => router.push({ pathname: '/checkout/[id]', params: { id: v.id } })
              : () => router.push({ pathname: '/sessions/[id]', params: { id: v.id } });
        return (
          <ListRow
            key={v.id}
            title={`${localDateTime(v.actual_start ?? v.scheduled_start, timeZone, i18n.language)} · ${
              v.station_name ?? ''
            }`}
            subtitle={
              v.total != null && v.bill_status !== 'void'
                ? money(v.total)
                : t(`sessions.status.${isStatus(status) ? status : 'completed'}`)
            }
            trailing={v.bill_status === 'void' ? <Badge label={t('checkout.status.void')} /> : null}
            onPress={open}
            testID={`visit-${v.id}`}
          />
        );
      })}
    </Card>
  );
}

const STATUSES = ['reserved', 'active', 'completed', 'cancelled', 'no_show'] as const;
const isStatus = (s: string): s is (typeof STATUSES)[number] =>
  STATUSES.includes(s as (typeof STATUSES)[number]);
