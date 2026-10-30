import type { TFunction } from 'i18next';

import { PAYMENT_METHODS } from '@/domain/billing';
import { EXPENSE_CATEGORIES } from '@/domain/expenses';
import { datesInRange, rangeDays, ranked, type IncomePeriod } from '@/domain/income';
import { percentChange } from '@/domain/reports';
import { formatClock } from '@/domain/zoned-time';
import { formatRange, localDateTime } from '@/features/income/format';

import { poundsCell, type ReportDocument, type ReportTable } from './export';
import { WEEK_ORDER, weekdayName } from './format';
import type { ReportModel } from './useReport';

/** Show every day up to this many days; longer ranges list only days with money. */
export const MAX_DAY_ROWS = 31;

export type ReportContext = {
  t: TFunction;
  locale: string;
  orgName: string;
  /** Null = all branches. */
  branchName: string | null;
  period: IncomePeriod;
  features: { customers: boolean; snacks: boolean; expenses: boolean };
  now: number;
  timeZone: string;
  branchNames: Map<string, string>;
  typeNames: Map<string, string>;
  customers: Map<string, { name: string | null; phone: string | null }>;
  products: Map<string, string>;
};

/** The days to list for a range: every day when short, otherwise only days with money. */
export function dayKeys(m: ReportModel): string[] {
  return rangeDays(m.range) <= MAX_DAY_ROWS
    ? datesInRange(m.range)
    : Object.keys(m.income.byDay).sort();
}

/** "Last week" / "Previous 10 days". */
export function previousLabel(t: TFunction, m: ReportModel, period: IncomePeriod): string {
  return t(`reports.previous.${period}`, { count: rangeDays(m.previous) });
}

const change = (current: number, previous: number) => {
  const pct = percentChange(current, previous);
  return pct == null ? '' : `${pct > 0 ? '+' : ''}${pct}%`;
};

/** Every section of the report as tables, for CSV and PDF. */
export function buildReportDocument(m: ReportModel, c: ReportContext): ReportDocument {
  const { t, features } = c;
  const unknown = t('income.unknown');
  const tables: ReportTable[] = [];

  const summary: ReportTable['rows'] = [
    [
      t('reports.profit.income'),
      poundsCell(m.income.net),
      poundsCell(m.previousIncome.net),
      change(m.income.net, m.previousIncome.net),
    ],
    [t('reports.table.payments'), m.income.payments, m.previousIncome.payments, ''],
    [
      t('reports.table.refunds'),
      poundsCell(m.income.refunded),
      poundsCell(m.previousIncome.refunded),
      '',
    ],
  ];
  if (features.expenses) {
    summary.push(
      [
        t('reports.profit.expenses'),
        poundsCell(m.expenses.total),
        poundsCell(m.previousExpenses.total),
        change(m.expenses.total, m.previousExpenses.total),
      ],
      [
        t('reports.profit.profit'),
        poundsCell(m.profit.profit),
        poundsCell(m.previousProfit.profit),
        change(m.profit.profit, m.previousProfit.profit),
      ],
    );
  }
  summary.push([t('reports.table.usage'), m.utilization.overall.pct, '', '']);
  tables.push({
    title: t('reports.table.summary'),
    headers: [
      t('reports.table.metric'),
      t('reports.table.thisPeriod'),
      `${t('reports.table.previousPeriod')} (${formatRange(m.previous, c.locale)})`,
      t('reports.table.change'),
    ],
    rows: summary,
  });

  tables.push({
    title: t('income.byMethod'),
    headers: [t('reports.table.method'), t('reports.table.amount')],
    rows: PAYMENT_METHODS.map((method) => [
      t(`checkout.method.${method}`),
      poundsCell(m.income.byMethod[method]),
    ]),
  });

  if (m.branches.length > 1) {
    tables.push({
      title: t('reports.branches.title'),
      headers: [
        t('reports.table.branch'),
        t('reports.table.income'),
        ...(features.expenses ? [t('reports.table.expenses'), t('reports.table.profit')] : []),
        t('reports.table.usage'),
      ],
      rows: m.branches.map((b) => [
        c.branchNames.get(b.branchId) || unknown,
        poundsCell(b.income),
        ...(features.expenses ? [poundsCell(b.expenses), poundsCell(b.profit)] : []),
        b.utilization ?? '',
      ]),
    });
  }

  tables.push({
    title: t('income.byStationType'),
    headers: [t('reports.table.stationType'), t('reports.table.amount')],
    rows: ranked(m.income.byStationType).map(([id, amount]) => [
      c.typeNames.get(id) || unknown,
      poundsCell(amount),
    ]),
  });

  if (rangeDays(m.range) > 1) {
    tables.push({
      title: t('income.byDay'),
      headers: [t('reports.table.day'), t('reports.table.amount')],
      rows: dayKeys(m).map((day) => [day, poundsCell(m.income.byDay[day] ?? 0)]),
    });
  }

  if (features.expenses) {
    tables.push({
      title: t('reports.profit.byCategory'),
      headers: [t('reports.table.category'), t('reports.table.amount')],
      rows: EXPENSE_CATEGORIES.filter((cat) => m.expenses.byCategory[cat]).map((cat) => [
        t(`expenses.category.${cat}`),
        poundsCell(m.expenses.byCategory[cat]),
      ]),
    });
  }

  tables.push({
    title: t('reports.usage.byStation'),
    headers: [
      t('reports.table.station'),
      t('reports.table.stationType'),
      t('reports.table.hoursUsed'),
      t('reports.table.usage'),
    ],
    rows: m.stations
      .filter((s) => m.utilization.byStation[s.id])
      .map((s) => {
        const u = m.utilization.byStation[s.id]!;
        return [
          s.name,
          c.typeNames.get(s.stationTypeId ?? '') || unknown,
          (u.used / 3_600_000).toFixed(1),
          u.pct,
        ];
      }),
  });

  tables.push({
    title: t('reports.usage.heatmap'),
    headers: [
      t('reports.table.weekday'),
      ...Array.from({ length: 24 }, (_, h) => formatClock(h * 60)),
    ],
    rows: WEEK_ORDER.map((d) => [
      weekdayName(d, c.locale),
      ...m.heatmap.busy[d]!.map((v) => v.toFixed(1)),
    ]),
  });

  if (features.customers) {
    tables.push({
      title: t('reports.customers.title'),
      headers: [
        t('reports.table.customer'),
        t('reports.table.phone'),
        t('reports.table.visits'),
        t('reports.table.amount'),
      ],
      rows: m.customers.map((x) => {
        const who = c.customers.get(x.customerId);
        return [who?.name || unknown, who?.phone ?? '', x.visits, poundsCell(x.net)];
      }),
    });
  }

  if (features.snacks) {
    tables.push({
      title: t('reports.snacks.title'),
      headers: [t('reports.table.product'), t('reports.table.quantity'), t('reports.table.amount')],
      rows: m.sales.byProduct.map((p) => [
        c.products.get(p.productId) || p.name || unknown,
        p.quantity,
        poundsCell(p.amount),
      ]),
    });
  }

  const subtitle = [formatRange(m.range, c.locale)];
  subtitle.push(t('reports.branchLine', { branch: c.branchName ?? t('income.allBranches') }));
  subtitle.push(
    t('reports.madeAt', {
      when: localDateTime(new Date(c.now).toISOString(), c.timeZone, c.locale),
    }),
  );

  return {
    title: t('reports.documentTitle', { org: c.orgName }),
    subtitle,
    tables,
    notes: [
      t('income.howCounted'),
      ...(features.expenses ? [t('reports.profit.hint')] : []),
      t('reports.usage.howCounted'),
    ],
  };
}
