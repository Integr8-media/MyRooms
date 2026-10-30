import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { normalizePhone, samePhone, searchCustomers } from '@/domain/items';
import { customerSchema, validate, type FieldErrors } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { CustomerRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Badge, Button, ListRow, Notice, Text, TextField } from '@/ui';

import { saveCustomer } from './api';
import { useCustomers } from './data';

/**
 * Find a customer by phone or name, or add a new one on the spot (start screen, reservation
 * form, session sheet). Only shown when the customers module is on.
 */
export function CustomerPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (customer: CustomerRow | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { org } = useWorkspace();
  const customers = useCustomers(org?.id);
  const selected = value ? customers.find((c) => c.id === value) : undefined;
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  if (value) {
    return (
      <View className="gap-2" testID="customer-picker">
        <Text className="text-sm font-medium">{t('customers.customer')}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="flex-1 gap-0.5">
            <Text className="font-medium" testID="customer-selected">
              {selected?.name ?? '…'}
            </Text>
            {selected?.phone ? <Text variant="muted">{selected.phone}</Text> : null}
          </View>
          {selected?.default_discount_pct ? (
            <Badge
              label={t('customers.discountBadge', { percent: selected.default_discount_pct })}
              tone="success"
            />
          ) : null}
          {!disabled ? (
            <Button
              label={t('customers.change')}
              variant="secondary"
              onPress={() => onChange(null)}
              testID="customer-clear"
            />
          ) : null}
        </View>
      </View>
    );
  }

  const results = searchCustomers(customers, query);
  return (
    <View className="gap-2" testID="customer-picker">
      <TextField
        label={t('customers.customer')}
        placeholder={t('customers.searchPlaceholder')}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setAdding(false);
        }}
        editable={!disabled}
        testID="customer-search"
      />
      {results.map((c) => (
        <ListRow
          key={c.id}
          title={c.name ?? ''}
          subtitle={c.phone}
          trailing={
            c.default_discount_pct ? (
              <Badge
                label={t('customers.discountBadge', { percent: c.default_discount_pct })}
                tone="success"
              />
            ) : null
          }
          onPress={
            disabled
              ? undefined
              : () => {
                  onChange(c);
                  setQuery('');
                }
          }
          testID={`customer-result-${c.id}`}
        />
      ))}
      {query.trim() && !results.length ? (
        <Text variant="muted">{t('customers.noMatch')}</Text>
      ) : null}
      {adding ? (
        <QuickAdd
          query={query}
          customers={customers}
          onAdded={(c) => {
            onChange(c);
            setAdding(false);
            setQuery('');
          }}
          onCancel={() => setAdding(false)}
        />
      ) : query.trim() && !disabled ? (
        <Button
          label={t('customers.addNew')}
          variant="secondary"
          className="self-start"
          onPress={() => setAdding(true)}
          testID="customer-add-new"
        />
      ) : null}
    </View>
  );
}

type QuickFields = { name: string; phone: string };

/** Name + phone, prefilled from the search (digits go to the phone, text to the name). */
function QuickAdd({
  query,
  customers,
  onAdded,
  onCancel,
}: {
  query: string;
  customers: readonly CustomerRow[];
  onAdded: (customer: CustomerRow) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { org } = useWorkspace();
  const { busy, error, run } = useAsyncAction();
  const looksLikePhone = normalizePhone(query).length >= 3 && !/\p{L}/u.test(query);
  const [values, setValues] = useState<QuickFields>({
    name: looksLikePhone ? '' : query.trim(),
    phone: looksLikePhone ? query.trim() : '',
  });
  const [errors, setErrors] = useState<FieldErrors<QuickFields>>({});
  const duplicate = samePhone(customers, values.phone);

  const save = async () => {
    const result = validate(customerSchema, { ...values, notes: '', discount: '0' });
    setErrors(result.errors);
    if (!result.ok || !org) return;
    const { discount: _discount, ...input } = result.data;
    await run(async () => {
      const id = await saveCustomer(org.id, null, input);
      onAdded({
        id,
        org_id: org.id,
        name: input.name,
        phone: input.phone,
        notes: null,
        default_discount_pct: 0,
        is_active: 1,
        created_by: null,
        created_at: null,
        updated_at: null,
      });
    });
  };

  return (
    <View className="gap-2 rounded-lg border border-border p-3" testID="customer-quick-add">
      <TextField
        label={t('customers.name')}
        value={values.name}
        onChangeText={(name) => setValues((v) => ({ ...v, name }))}
        error={errors.name && t(`validation.${errors.name}`)}
        testID="customer-new-name"
      />
      <TextField
        label={t('customers.phone')}
        value={values.phone}
        onChangeText={(phone) => setValues((v) => ({ ...v, phone }))}
        keyboardType="phone-pad"
        inputMode="tel"
        error={errors.phone && t(`validation.${errors.phone}`)}
        testID="customer-new-phone"
      />
      {duplicate ? (
        <Notice
          tone="warning"
          message={t('customers.samePhone', { name: duplicate.name ?? '' })}
          testID="customer-duplicate"
        />
      ) : null}
      <ErrorNotice error={error} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t('customers.saveAndPick')}
          disabled={busy}
          onPress={() => void save()}
          testID="customer-new-save"
        />
        {duplicate ? (
          <Button
            label={t('customers.pickExisting', { name: duplicate.name ?? '' })}
            variant="secondary"
            onPress={() => onAdded(duplicate)}
          />
        ) : null}
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}
