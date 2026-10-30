import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PAYMENT_METHODS, isPaymentMethod, type PaymentMethod } from '@/domain/billing';
import { EXPENSE_CATEGORIES } from '@/domain/expenses';
import { toPoundsInput } from '@/domain/money';
import { expenseSchema, validate, type FieldErrors } from '@/domain/validation';
import { dateKey, toLocal } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { ExpenseRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Button,
  Card,
  Notice,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
  TextField,
} from '@/ui';

import { createExpense, deleteExpense, updateExpense } from './api';

/** `/expenses/new` (in the current branch) or `/expenses/<id>`. */
export function ExpenseScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data, isLoading } = useQuery<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [
    isNew ? null : id,
  ]);
  const expense = data[0];
  if (!isNew && !expense) {
    return isLoading ? null : (
      <Screen>
        <ScreenHeader title={t('expenses.title')} />
        <Notice tone="warning" message={t('expenses.notFound')} />
      </Screen>
    );
  }
  return <ExpenseForm key={expense?.id ?? 'new'} expense={expense ?? null} />;
}

type Fields = {
  category: string;
  amount: string;
  method: PaymentMethod;
  date: string;
  note: string;
};

function ExpenseForm({ expense }: { expense: ExpenseRow | null }) {
  const { t } = useTranslation();
  const { org, branch, branches, can } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const editable = can('expenses.manage');
  const { busy, error, run } = useAsyncAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [values, setValues] = useState<Fields>(() => ({
    category: expense?.category ?? '',
    amount: expense ? toPoundsInput(expense.amount ?? 0) : '',
    method: isPaymentMethod(expense?.method) ? expense.method : 'cash',
    date: expense?.spent_on?.slice(0, 10) ?? dateKey(toLocal(Date.now(), timeZone)),
    note: expense?.note ?? '',
  }));
  const [errors, setErrors] = useState<FieldErrors<Fields>>({});
  const set = (key: keyof Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const err = (key: keyof Fields) => errors[key] && t(`validation.${errors[key]}`);
  const branchName = branches.find((b) => b.id === (expense?.branch_id ?? branch?.id))?.name;

  const save = async () => {
    const result = validate(expenseSchema, values);
    setErrors(result.errors);
    if (!result.ok || !org || (!expense && !branch)) return;
    const ok = await run(async () => {
      if (expense) await updateExpense(expense.id, result.data);
      else await createExpense(org.id, branch!.id, result.data);
    });
    if (ok) router.back();
  };

  return (
    <Screen>
      <ScreenHeader title={expense ? t('expenses.edit') : t('expenses.add')} />
      {branchName ? (
        <Text variant="muted">{t('stations.inBranch', { name: branchName })}</Text>
      ) : null}
      <Card className="gap-4">
        <View className="gap-2">
          <Text className="text-sm font-medium">{t('expenses.categoryLabel')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <Button
                key={c}
                label={t(`expenses.category.${c}`)}
                variant="secondary"
                selected={values.category === c}
                disabled={!editable}
                onPress={() => setValues((v) => ({ ...v, category: c }))}
                testID={`expense-category-${c}`}
              />
            ))}
          </View>
          {err('category') ? <Notice tone="danger" message={err('category')!} /> : null}
        </View>
        <TextField
          label={t('expenses.amount')}
          value={values.amount}
          onChangeText={set('amount')}
          keyboardType="decimal-pad"
          inputMode="decimal"
          editable={editable}
          error={err('amount')}
          testID="expense-amount"
        />
        <View className="gap-2">
          <Text className="text-sm font-medium">{t('expenses.method')}</Text>
          <SegmentedControl<PaymentMethod>
            value={values.method}
            onChange={(method) => editable && setValues((v) => ({ ...v, method }))}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`checkout.method.${m}`) }))}
          />
        </View>
        <TextField
          label={t('expenses.date')}
          hint={t('income.dateHint')}
          value={values.date}
          onChangeText={set('date')}
          editable={editable}
          error={err('date')}
          testID="expense-date"
        />
        <TextField
          label={t('expenses.note')}
          value={values.note}
          onChangeText={set('note')}
          editable={editable}
          error={err('note')}
          testID="expense-note"
        />
        <ErrorNotice error={error} />
        {editable ? (
          <Button
            label={t('common.save')}
            className="self-start"
            disabled={busy}
            onPress={() => void save()}
            testID="expense-save"
          />
        ) : null}
      </Card>

      {expense && editable ? (
        <Card className="gap-2">
          {confirmDelete ? (
            <>
              <Text variant="heading">{t('expenses.confirmDelete')}</Text>
              <View className="flex-row flex-wrap gap-2">
                <Button
                  label={t('expenses.deleteNow')}
                  variant="danger"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await deleteExpense(expense.id);
                      router.back();
                    })
                  }
                  testID="expense-confirm-delete"
                />
                <Button
                  label={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setConfirmDelete(false)}
                />
              </View>
            </>
          ) : (
            <Button
              label={t('expenses.delete')}
              variant="secondary"
              className="self-start"
              onPress={() => setConfirmDelete(true)}
              testID="expense-delete"
            />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
