import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isPaymentMethod, PAYMENT_METHODS } from '@/domain/billing';
import {
  countedEntries,
  customRange,
  datesInRange,
  periodRange,
  rangeDays,
  ranked,
  share,
  summarizeIncome,
  utcDateWindow,
  type DateRange,
  type IncomePeriod,
  type IncomeSummary,
} from '@/domain/income';
import { formatMoney } from '@/domain/money';
import { useNow } from '@/features/sessions/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Card, Screen, ScreenHeader, SegmentedControl, Text, TextField } from '@/ui';

import { toIncomeEntry, useIncomeRows, useStationTypeNames, type IncomeRow } from './data';
import { formatDateKey, formatRange, localClock } from './format';

const ALL = 'all';
/** Show every day (zeros included) up to this many days; longer ranges list only days with money. */
const MAX_DAY_ROWS = 31;

/** Owners and managers: income report. Cashiers: their own collections today. */
export function IncomeScreen() {
  const { can } = useWorkspace();
  return can('income.view') ? <IncomeReport /> : <MyShift />;
}

function IncomeReport() {
  const { t, i18n } = useTranslation();
  const { org, branches } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(60_000);
  const locale = i18n.language;

  const [period, setPeriod] = useState<IncomePeriod>('today');
  const today = periodRange('today', now, timeZone);
  const [from, setFrom] = useState(today.fromDate);
  const [to, setTo] = useState(today.toDate);
  const [branchId, setBranchId] = useState<string>(ALL);

  const custom = period === 'custom' ? customRange(from, to, timeZone) : null;
  const range: DateRange | null =
    period === 'custom' ? (custom?.range ?? null) : periodRange(period, now, timeZone);

  // Before a valid custom range is entered, query nothing (an empty window).
  const { data: rows } = useIncomeRows(org?.id, range ? utcDateWindow(range) : ['', '']);
  const typeNames = useStationTypeNames(org?.id);
  const branchNames = new Map(branches.map((b) => [b.id, b.name ?? '']));

  const filter = { branchId: branchId === ALL ? null : branchId };
  const summary = range ? summarizeIncome(rows.map(toIncomeEntry), range, timeZone, filter) : null;
  const money = (amount: number) => formatMoney(amount, locale);

  return (
    <Screen>
      <ScreenHeader title={t('income.title')} />

      <SegmentedControl
        value={period}
        onChange={setPeriod}
        options={(['today', 'week', 'month', 'custom'] as const).map((p) => ({
          value: p,
          label: t(`income.period.${p}`),
        }))}
      />

      {period === 'custom' ? (
        <Card>
          <View className="flex-row flex-wrap gap-3">
            <TextField
              label={t('income.from')}
              value={from}
              onChangeText={setFrom}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              className="min-w-40 flex-1"
              testID="income-from"
            />
            <TextField
              label={t('income.to')}
              value={to}
              onChangeText={setTo}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              className="min-w-40 flex-1"
              testID="income-to"
            />
          </View>
          {custom?.error ? (
            <Text className="text-sm text-danger" accessibilityRole="alert" testID="range-error">
              {t(`income.rangeError.${custom.error}`)}
            </Text>
          ) : (
            <Text variant="muted">{t('income.dateHint')}</Text>
          )}
        </Card>
      ) : null}

      {branches.length > 1 ? (
        <SegmentedControl
          value={branchId}
          onChange={setBranchId}
          options={[
            { value: ALL, label: t('income.allBranches') },
            ...branches.map((b) => ({ value: b.id, label: b.name ?? '' })),
          ]}
        />
      ) : null}

      {range && summary ? (
        <>
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

          {branchId === ALL && branches.length > 1 ? (
            <Card testID="income-by-branch">
              <Text variant="heading">{t('income.byBranch')}</Text>
              <AmountBars
                total={summary.net}
                money={money}
                items={ranked(summary.byBranch).map(([id, amount]) => ({
                  key: id,
                  label: branchNames.get(id) || t('income.unknown'),
                  amount,
                }))}
                empty={t('income.nothing')}
                testPrefix="branch"
              />
            </Card>
          ) : null}

          <Card testID="income-by-type">
            <Text variant="heading">{t('income.byStationType')}</Text>
            <AmountBars
              total={summary.net}
              money={money}
              items={ranked(summary.byStationType).map(([id, amount]) => ({
                key: id || 'unknown',
                label: typeNames.get(id) || t('income.unknown'),
                amount,
              }))}
              empty={t('income.nothing')}
              testPrefix="type"
            />
          </Card>

          {rangeDays(range) > 1 ? (
            <Card testID="income-by-day">
              <Text variant="heading">{t('income.byDay')}</Text>
              <AmountBars
                total={Math.max(0, ...Object.values(summary.byDay))}
                relativeToMax
                money={money}
                items={(rangeDays(range) <= MAX_DAY_ROWS
                  ? datesInRange(range)
                  : Object.keys(summary.byDay).sort()
                ).map((day) => ({
                  key: day,
                  label: formatDateKey(day, locale),
                  amount: summary.byDay[day] ?? 0,
                }))}
                empty={t('income.nothing')}
                testPrefix="day"
              />
            </Card>
          ) : null}

          <Text variant="muted">{t('income.howCounted')}</Text>
        </>
      ) : null}
    </Screen>
  );
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

function TotalCard({
  title,
  summary,
  money,
  testID,
}: {
  title: string;
  summary: IncomeSummary;
  money: (n: number) => string;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text variant="muted">{title}</Text>
      <Text variant="title" testID={testID}>
        {money(summary.net)}
      </Text>
      <Text variant="muted" testID="income-counts">
        {t('income.counts', { count: summary.payments, received: money(summary.received) })}
        {summary.refunds
          ? ` · ${t('income.refunds', { count: summary.refunds, amount: money(summary.refunded) })}`
          : ''}
      </Text>
    </Card>
  );
}

type BarItem = { key: string; label: string; amount: number };

/**
 * Labeled amounts with a bar each. Bars show the share of `total` (or, with relativeToMax,
 * the size compared with the largest item). Bars start at the reading direction's start.
 */
function AmountBars({
  items,
  total,
  relativeToMax,
  money,
  empty,
  testPrefix,
}: {
  items: BarItem[];
  total: number;
  relativeToMax?: boolean;
  money: (n: number) => string;
  empty?: string;
  testPrefix: string;
}) {
  if (!items.length && empty) return <Text variant="muted">{empty}</Text>;
  return (
    <View className="gap-3">
      {items.map((item) => {
        const pct = share(item.amount, total);
        return (
          <View key={item.key} className="gap-1" testID={`${testPrefix}-${item.key}`}>
            <View className="flex-row items-baseline gap-2">
              <Text className="flex-1">{item.label}</Text>
              {!relativeToMax && total > 0 ? <Text variant="muted">{`${pct}%`}</Text> : null}
              <Text
                className={item.amount < 0 ? 'font-semibold text-danger' : 'font-semibold'}
                testID={`${testPrefix}-${item.key}-amount`}
              >
                {money(item.amount)}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-border/60">
              <View className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
