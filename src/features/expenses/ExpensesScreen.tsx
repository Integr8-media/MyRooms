import { useQuery } from '@powersync/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isPaymentMethod } from '@/domain/billing';
import { EXPENSE_CATEGORIES, isExpenseCategory, summarizeExpenses } from '@/domain/expenses';
import { periodRange } from '@/domain/income';
import { formatMoney } from '@/domain/money';
import { formatDateKey, formatRange } from '@/features/income/format';
import { useNow } from '@/features/sessions/data';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { ExpenseRow } from '@/lib/powersync/schema';
import { Button, Card, ListRow, Notice, Screen, ScreenHeader, SegmentedControl, Text } from '@/ui';

type Period = 'today' | 'week' | 'month';

/** Expenses of the current branch for today, this week or this month. */
export function ExpensesScreen() {
  const { t, i18n } = useTranslation();
  const { org, branch, can, features } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(60_000);
  const [period, setPeriod] = useState<Period>('month');
  const range = periodRange(period, now, timeZone);
  const { data: rows } = useQuery<ExpenseRow>(
    `SELECT * FROM expenses WHERE branch_id = ? AND substr(spent_on, 1, 10) BETWEEN ? AND ?
      ORDER BY spent_on DESC, created_at DESC`,
    [branch?.id ?? null, range.fromDate, range.toDate],
  );
  const summary = summarizeExpenses(rows, range);
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const open = (id: string) => router.push({ pathname: '/expenses/[id]', params: { id } });

  if (!features.expenses || !can('expenses.manage')) {
    return (
      <Screen>
        <ScreenHeader title={t('expenses.title')} />
        <Notice
          tone="info"
          message={features.expenses ? t('errors.not_allowed') : t('modules.off')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t('expenses.title')}
        actions={
          branch ? (
            <Button label={t('expenses.add')} onPress={() => open('new')} testID="add-expense" />
          ) : null
        }
      />
      <BranchSwitcher />
      {!branch ? <Notice tone="warning" message={t('home.noBranch')} /> : null}
      <SegmentedControl<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: t('income.period.today') },
          { value: 'week', label: t('income.period.week') },
          { value: 'month', label: t('income.period.month') },
        ]}
      />
      <Card className="gap-1" testID="expenses-summary">
        <Text variant="muted">{formatRange(range, i18n.language)}</Text>
        <Text className="text-3xl font-bold tabular-nums" testID="expenses-total">
          {money(summary.total)}
        </Text>
        <Text variant="muted">{t('expenses.count', { count: summary.count })}</Text>
        {EXPENSE_CATEGORIES.filter((c) => summary.byCategory[c]).map((c) => (
          <View key={c} className="flex-row">
            <Text className="flex-1">{t(`expenses.category.${c}`)}</Text>
            <Text testID={`expenses-by-${c}`}>{money(summary.byCategory[c])}</Text>
          </View>
        ))}
      </Card>
      <Card className="gap-1">
        {rows.length === 0 ? <Text variant="muted">{t('expenses.empty')}</Text> : null}
        {rows.map((e) => (
          <ListRow
            key={e.id}
            title={`${t(`expenses.category.${isExpenseCategory(e.category) ? e.category : 'other'}`)} · ${money(e.amount ?? 0)}`}
            subtitle={[
              formatDateKey(e.spent_on?.slice(0, 10) ?? '', i18n.language),
              t(`checkout.method.${isPaymentMethod(e.method) ? e.method : 'cash'}`),
              e.note,
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => open(e.id)}
            testID={`expense-${e.id}`}
          />
        ))}
      </Card>
    </Screen>
  );
}
