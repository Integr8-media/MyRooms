import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isPaymentMethod, PAYMENT_METHODS } from '@/domain/billing';
import { countedEntries, periodRange, summarizeIncome, utcDateWindow } from '@/domain/income';
import { formatMoney } from '@/domain/money';
import { ReportsScreen } from '@/features/reports/ReportsScreen';
import { useNow } from '@/features/sessions/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Card, Screen, ScreenHeader, Text } from '@/ui';

import { toIncomeEntry, useIncomeRows, type IncomeRow } from './data';
import { formatRange, localClock } from './format';
import { AmountBars, TotalCard } from './parts';

/** Owners and managers: reports (income, profit, usage...). Cashiers: their own collections today. */
export function IncomeScreen() {
  const { can } = useWorkspace();
  return can('income.view') ? <ReportsScreen /> : <MyShift />;
}

/** Cashiers: the money they took themselves today, to check against the drawer. */
function MyShift() {
  const { t, i18n } = useTranslation();
  const { org, userId } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(60_000);
  const locale = i18n.language;
  const money = (amount: number) => formatMoney(amount, locale);

  const range = periodRange('today', now, timeZone);
  const { data: rows } = useIncomeRows(org?.id, utcDateWindow(range));
  // Never fall back to "everyone" if the user id is missing.
  const filter = { receivedBy: userId ?? '\u0000' };
  const entries = rows.map(toIncomeEntry);
  const summary = summarizeIncome(entries, range, timeZone, filter);
  const counted = new Set(countedEntries(entries, range, filter));
  const mine = rows.filter((_, i) => counted.has(entries[i]!));

  return (
    <Screen>
      <ScreenHeader title={t('income.myShift')} />
      <Text variant="muted">{t('income.myShiftHint')}</Text>

      <TotalCard
        title={formatRange(range, locale)}
        summary={summary}
        money={money}
        testID="income-total"
      />

      <Card testID="income-by-method">
        <Text variant="heading">{t('income.byMethod')}</Text>
        <AmountBars
          total={summary.net}
          money={money}
          items={PAYMENT_METHODS.map((m) => ({
            key: m,
            label: t(`checkout.method.${m}`),
            amount: summary.byMethod[m],
          }))}
          testPrefix="method"
        />
      </Card>

      <Card className="gap-1" testID="my-payments">
        <Text variant="heading">{t('income.myPayments', { count: mine.length })}</Text>
        {mine.length ? (
          mine.map((row) => <PaymentLine key={row.id} row={row} timeZone={timeZone} />)
        ) : (
          <Text variant="muted">{t('income.nothingToday')}</Text>
        )}
      </Card>
    </Screen>
  );
}

function PaymentLine({ row, timeZone }: { row: IncomeRow; timeZone: string }) {
  const { t, i18n } = useTranslation();
  const refund = row.kind === 'refund';
  // Only counted rows reach here, so the method is always a known one.
  const method = t(`checkout.method.${isPaymentMethod(row.method) ? row.method : 'cash'}`);
  const parts = [localClock(row.paid_at, timeZone), row.station_name];
  if (row.bill_number != null) parts.push(t('checkout.receiptNumber', { number: row.bill_number }));
  return (
    <View className="min-h-12 flex-row items-center gap-3 py-2" testID={`payment-${row.id}`}>
      <View className="flex-1 gap-0.5">
        <Text className="font-medium">
          {refund ? `${t('checkout.refunded')} · ${method}` : method}
        </Text>
        <Text variant="muted">{parts.filter(Boolean).join(' · ')}</Text>
      </View>
      <Text className={refund ? 'font-semibold text-danger' : 'font-semibold'}>
        {formatMoney(refund ? -(row.amount ?? 0) : (row.amount ?? 0), i18n.language)}
      </Text>
    </View>
  );
}
