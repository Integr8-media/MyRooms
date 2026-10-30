import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PAYMENT_METHODS } from '@/domain/billing';
import { EXPENSE_CATEGORIES } from '@/domain/expenses';
import {
  customRange,
  periodRange,
  rangeDays,
  ranked,
  type DateRange,
  type IncomePeriod,
} from '@/domain/income';
import { formatMoney } from '@/domain/money';
import { percentChange, previousRange } from '@/domain/reports';
import { formatClock } from '@/domain/zoned-time';
import { useStationTypeNames } from '@/features/income/data';
import { formatDateKey, formatRange } from '@/features/income/format';
import { AmountBars, TotalCard } from '@/features/income/parts';
import { useNow } from '@/features/sessions/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
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

import { useReportNames } from './data';
import { buildReportDocument, dayKeys, previousLabel, type ReportContext } from './document';
import { reportCsv, reportFileName, reportHtml } from './export';
import {
  formatChange,
  formatDecimal,
  formatHours,
  formatPercent,
  WEEK_ORDER,
  weekdayName,
} from './format';
import { shareCsv, sharePdf } from './share';
import { useReport, type ReportModel } from './useReport';

const ALL = 'all';
type ReportView = 'overview' | 'usage' | 'customers' | 'snacks';

/** Owners and managers: income, net profit, usage, busiest hours, customers and snack sales. */
export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const { org, branches, features } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(60_000);
  const locale = i18n.language;

  const [period, setPeriod] = useState<IncomePeriod>('today');
  const today = periodRange('today', now, timeZone);
  const [from, setFrom] = useState(today.fromDate);
  const [to, setTo] = useState(today.toDate);
  const [branchId, setBranchId] = useState<string>(ALL);
  const [view, setView] = useState<ReportView>('overview');

  const custom = period === 'custom' ? customRange(from, to, timeZone) : null;
  const range: DateRange | null =
    period === 'custom' ? (custom?.range ?? null) : periodRange(period, now, timeZone);
  const previous = range ? previousRange(range, period, timeZone) : null;

  const model = useReport({
    orgId: org?.id,
    timeZone,
    range,
    previous,
    branchId: branchId === ALL ? null : branchId,
    branchIds: branches.map((b) => b.id),
    now,
  });
  const typeNames = useStationTypeNames(org?.id);
  const names = useReportNames(org?.id);
  const branchNames = new Map(branches.map((b) => [b.id, b.name ?? '']));
  const exporting = useAsyncAction();

  const views: { value: ReportView; label: string }[] = [
    { value: 'overview', label: t('reports.view.overview') },
    { value: 'usage', label: t('reports.view.usage') },
    ...(features.customers
      ? [{ value: 'customers' as const, label: t('reports.view.customers') }]
      : []),
    ...(features.snacks ? [{ value: 'snacks' as const, label: t('reports.view.snacks') }] : []),
  ];
  // A module switched off while its tab was open: fall back to the overview.
  const shown = views.some((v) => v.value === view) ? view : 'overview';

  const context: ReportContext = {
    t,
    locale,
    orgName: org?.name ?? '',
    branchName: branchId === ALL ? null : (branchNames.get(branchId) ?? null),
    period,
    features,
    now,
    timeZone,
    branchNames,
    typeNames,
    customers: names.customers,
    products: names.products,
  };

  const exportAs = (kind: 'csv' | 'pdf') =>
    exporting.run(async () => {
      if (!model) return;
      const doc = buildReportDocument(model, context);
      const name = reportFileName(model.range.fromDate, model.range.toDate);
      if (kind === 'csv') await shareCsv(reportCsv(doc), name, doc.title);
      else await sharePdf(reportHtml(doc, locale), name, doc.title);
    });

  return (
    <Screen>
      <ScreenHeader
        title={t('reports.title')}
        actions={
          model ? (
            <View className="flex-row flex-wrap gap-2">
              <Button
                label={t('reports.exportCsv')}
                variant="secondary"
                disabled={exporting.busy}
                onPress={() => exportAs('csv')}
                testID="export-csv"
              />
              <Button
                label={t('reports.exportPdf')}
                variant="secondary"
                disabled={exporting.busy}
                onPress={() => exportAs('pdf')}
                testID="export-pdf"
              />
            </View>
          ) : null
        }
      />
      {exporting.error ? <Notice tone="danger" message={t('reports.exportFailed')} /> : null}

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

      <SegmentedControl value={shown} onChange={setView} options={views} />

      {model ? (
        shown === 'overview' ? (
          <Overview model={model} context={context} />
        ) : shown === 'usage' ? (
          <Usage model={model} context={context} />
        ) : shown === 'customers' ? (
          <Customers model={model} context={context} />
        ) : (
          <Snacks model={model} context={context} />
        )
      ) : null}
    </Screen>
  );
}

type SectionProps = { model: ReportModel; context: ReportContext };

/** "Last week: EGP 1,200.00 · +25%". */
function Compared({
  current,
  previous,
  label,
  money,
  locale,
  testID,
}: {
  current: number;
  previous: number;
  label: string;
  money: (n: number) => string;
  locale: string;
  testID: string;
}) {
  const { t } = useTranslation();
  const pct = percentChange(current, previous);
  return (
    <Text variant="muted" testID={testID}>
      {t('reports.comparedWith', { period: label, amount: money(previous) })}
      {' · '}
      {pct == null ? t('reports.noEarlier') : formatChange(pct, locale)}
    </Text>
  );
}

function Overview({ model: m, context: c }: SectionProps) {
  const { t, locale, features } = c;
  const money = (amount: number) => formatMoney(amount, locale);
  const prevLabel = previousLabel(t, m, c.period);
  const unknown = t('income.unknown');

  return (
    <>
      <TotalCard
        title={formatRange(m.range, locale)}
        summary={m.income}
        money={money}
        testID="income-total"
      >
        <Compared
          current={m.income.net}
          previous={m.previousIncome.net}
          label={prevLabel}
          money={money}
          locale={locale}
          testID="income-compared"
        />
      </TotalCard>

      {features.expenses ? (
        <Card className="gap-2" testID="profit-card">
          <Text variant="heading">{t('reports.profit.title')}</Text>
          <Line label={t('reports.profit.income')} value={money(m.profit.income)} />
          <Line
            label={t('reports.profit.expenses')}
            value={money(-m.profit.expenses)}
            testID="profit-expenses"
          />
          <View className="h-px bg-border" />
          <Line
            label={t('reports.profit.profit')}
            value={money(m.profit.profit)}
            strong
            danger={m.profit.profit < 0}
            testID="profit-total"
          />
          <Compared
            current={m.profit.profit}
            previous={m.previousProfit.profit}
            label={prevLabel}
            money={money}
            locale={locale}
            testID="profit-compared"
          />
          {EXPENSE_CATEGORIES.some((cat) => m.expenses.byCategory[cat]) ? (
            <View className="gap-1 pt-2">
              <Text className="font-medium">{t('reports.profit.byCategory')}</Text>
              {EXPENSE_CATEGORIES.filter((cat) => m.expenses.byCategory[cat]).map((cat) => (
                <Line
                  key={cat}
                  label={t(`expenses.category.${cat}`)}
                  value={money(m.expenses.byCategory[cat])}
                  muted
                />
              ))}
            </View>
          ) : (
            <Text variant="muted">{t('reports.profit.noExpenses')}</Text>
          )}
          <Text variant="muted">{t('reports.profit.hint')}</Text>
        </Card>
      ) : null}

      <Card testID="income-by-method">
        <Text variant="heading">{t('income.byMethod')}</Text>
        <AmountBars
          total={m.income.net}
          money={money}
          items={PAYMENT_METHODS.map((method) => ({
            key: method,
            label: t(`checkout.method.${method}`),
            amount: m.income.byMethod[method],
          }))}
          testPrefix="method"
        />
      </Card>

      {m.branches.length > 1 ? (
        <Card testID="branch-compare">
          <Text variant="heading">{t('reports.branches.title')}</Text>
          <AmountBars
            total={m.income.net}
            money={money}
            items={[...m.branches]
              .sort((a, b) => b.income - a.income)
              .map((b) => {
                const usage = b.utilization == null ? '—' : formatPercent(b.utilization, locale);
                return {
                  key: b.branchId,
                  label: c.branchNames.get(b.branchId) || unknown,
                  amount: features.expenses ? b.profit : b.income,
                  detail: features.expenses
                    ? t('reports.branches.line', {
                        income: money(b.income),
                        expenses: money(b.expenses),
                        usage,
                      })
                    : t('reports.branches.lineNoExpenses', { income: money(b.income), usage }),
                  pct: b.utilization ?? 0,
                };
              })}
            testPrefix="branch"
          />
        </Card>
      ) : null}

      <Card testID="income-by-type">
        <Text variant="heading">{t('income.byStationType')}</Text>
        <AmountBars
          total={m.income.net}
          money={money}
          items={ranked(m.income.byStationType).map(([id, amount]) => ({
            key: id || 'unknown',
            label: c.typeNames.get(id) || unknown,
            amount,
          }))}
          empty={t('income.nothing')}
          testPrefix="type"
        />
      </Card>

      {rangeDays(m.range) > 1 ? (
        <Card testID="income-by-day">
          <Text variant="heading">{t('income.byDay')}</Text>
          <AmountBars
            total={Math.max(0, ...Object.values(m.income.byDay))}
            relativeToMax
            money={money}
            items={dayKeys(m).map((day) => ({
              key: day,
              label: formatDateKey(day, locale),
              amount: m.income.byDay[day] ?? 0,
            }))}
            empty={t('income.nothing')}
            testPrefix="day"
          />
        </Card>
      ) : null}

      <Text variant="muted">{t('income.howCounted')}</Text>
    </>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
  danger,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  danger?: boolean;
  testID?: string;
}) {
  const weight = strong ? 'text-lg font-bold' : 'font-medium';
  return (
    <View className="flex-row items-baseline gap-2">
      <Text variant={muted ? 'muted' : 'body'} className="flex-1">
        {label}
      </Text>
      <Text
        className={`${weight} tabular-nums ${danger ? 'text-danger' : ''}`}
        variant={muted ? 'muted' : 'body'}
        testID={testID}
      >
        {value}
      </Text>
    </View>
  );
}

function Usage({ model: m, context: c }: SectionProps) {
  const { t, locale } = c;
  const u = m.utilization;
  const unknown = t('income.unknown');
  const pctItem = (key: string, label: string, used: number, pct: number) => ({
    key,
    label,
    amount: pct,
    value: formatPercent(pct, locale),
    detail: t('reports.usage.hours', {
      used: formatHours(used, locale),
      available: formatHours(u.byStation[key]?.available ?? 0, locale),
    }),
    pct,
  });

  if (!m.stations.length) return <Notice tone="info" message={t('reports.usage.noStations')} />;

  return (
    <>
      <Card testID="usage-overall">
        <Text variant="muted">{formatRange(m.range, locale)}</Text>
        <Text variant="title" testID="usage-pct">
          {formatPercent(u.overall.pct, locale)}
        </Text>
        <Text variant="muted">
          {t('reports.usage.overall', { pct: formatPercent(u.overall.pct, locale) })}
          {' · '}
          {t('reports.usage.hours', {
            used: formatHours(u.overall.used, locale),
            available: formatHours(u.overall.available, locale),
          })}
        </Text>
      </Card>

      <Card testID="usage-by-type">
        <Text variant="heading">{t('reports.usage.byType')}</Text>
        <AmountBars
          total={0}
          money={(n) => String(n)}
          items={Object.entries(u.byType)
            .sort((a, b) => b[1].pct - a[1].pct || a[0].localeCompare(b[0]))
            .map(([id, x]) => ({
              key: id || 'unknown',
              label: c.typeNames.get(id) || unknown,
              amount: x.pct,
              value: formatPercent(x.pct, locale),
              detail: t('reports.usage.hours', {
                used: formatHours(x.used, locale),
                available: formatHours(x.available, locale),
              }),
              pct: x.pct,
            }))}
          empty={t('reports.usage.nothing')}
          testPrefix="usage-type"
        />
      </Card>

      <Card testID="heatmap">
        <Text variant="heading">{t('reports.usage.heatmap')}</Text>
        <Text variant="muted">{t('reports.usage.heatmapHint')}</Text>
        {m.heatmap.peak ? (
          <>
            <Heatmap model={m} locale={locale} />
            <Text testID="heatmap-peak">
              {t('reports.usage.peak', {
                day: weekdayName(m.heatmap.peak.weekday, locale),
                hour: formatClock(m.heatmap.peak.hour * 60),
                busy: formatDecimal(m.heatmap.max, locale),
              })}
            </Text>
          </>
        ) : (
          <Text variant="muted">{t('reports.usage.nothing')}</Text>
        )}
      </Card>

      <Card testID="usage-by-station">
        <Text variant="heading">{t('reports.usage.byStation')}</Text>
        <AmountBars
          total={0}
          money={(n) => String(n)}
          items={m.stations
            .filter((s) => u.byStation[s.id])
            .map((s) => pctItem(s.id, s.name, u.byStation[s.id]!.used, u.byStation[s.id]!.pct))}
          empty={t('reports.usage.nothing')}
          testPrefix="usage-station"
        />
      </Card>

      <Text variant="muted">{t('reports.usage.howCounted')}</Text>
    </>
  );
}

/**
 * Weekdays as rows, the 24 hours as columns (running in the reading direction). Each cell is
 * darker the busier that hour was, compared with the busiest one.
 */
function Heatmap({ model: m, locale }: { model: ReportModel; locale: string }) {
  const max = m.heatmap.max;
  return (
    <View className="gap-0.5" testID="heatmap-grid">
      <View className="flex-row items-end gap-0.5">
        <View className="w-10" />
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} className="flex-1">
            {h % 6 === 0 ? (
              <Text variant="muted" className="text-[10px]" numberOfLines={1}>
                {String(h)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {WEEK_ORDER.map((d) => (
        <View key={d} className="flex-row items-center gap-0.5">
          <Text variant="muted" className="w-10 text-xs" numberOfLines={1}>
            {weekdayName(d, locale)}
          </Text>
          {m.heatmap.busy[d]!.map((value, h) => (
            <View key={h} className="h-5 flex-1 rounded-sm bg-border/40">
              {value > 0 ? (
                <View
                  className="h-5 rounded-sm bg-primary"
                  style={{ opacity: Math.max(0.12, value / max) }}
                  testID={`heat-${d}-${h}`}
                />
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Customers({ model: m, context: c }: SectionProps) {
  const { t, locale } = c;
  const money = (amount: number) => formatMoney(amount, locale);
  const top = m.customers[0]?.net ?? 0;
  return (
    <Card testID="top-customers">
      <Text variant="heading">{t('reports.customers.title')}</Text>
      <Text variant="muted">{t('reports.customers.hint')}</Text>
      <AmountBars
        total={top}
        relativeToMax
        money={money}
        items={m.customers.map((x) => {
          const who = c.customers.get(x.customerId);
          return {
            key: x.customerId,
            label: who?.name || t('income.unknown'),
            amount: x.net,
            detail: [who?.phone, t('reports.customers.visits', { count: x.visits })]
              .filter(Boolean)
              .join(' · '),
          };
        })}
        empty={t('reports.customers.nothing')}
        testPrefix="customer"
      />
    </Card>
  );
}

function Snacks({ model: m, context: c }: SectionProps) {
  const { t, locale } = c;
  const money = (amount: number) => formatMoney(amount, locale);
  return (
    <Card testID="snack-sales">
      <Text variant="heading">{t('reports.snacks.title')}</Text>
      <Text testID="snack-total">
        {t('reports.snacks.total', { count: m.sales.quantity, amount: money(m.sales.amount) })}
      </Text>
      <AmountBars
        total={m.sales.amount}
        money={money}
        items={m.sales.byProduct.map((p) => ({
          key: p.productId || 'unknown',
          label: c.products.get(p.productId) || p.name || t('income.unknown'),
          amount: p.amount,
          detail: t('reports.snacks.quantity', { count: p.quantity }),
        }))}
        empty={t('reports.snacks.nothing')}
        testPrefix="product"
      />
      <Text variant="muted">{t('reports.snacks.hint')}</Text>
    </Card>
  );
}
