import { summarizeExpenses, type ExpenseSummary } from '@/domain/expenses';
import {
  summarizeIncome,
  utcDateWindow,
  type DateRange,
  type IncomeSummary,
} from '@/domain/income';
import {
  compareBranches,
  netProfit,
  occupancyHeatmap,
  summarizeItemSales,
  summarizeUtilization,
  topCustomers,
  type BranchFigures,
  type CustomerTotal,
  type Heatmap,
  type ItemSalesSummary,
  type ProfitSummary,
  type UtilizationReport,
} from '@/domain/reports';
import { toIncomeEntry, useIncomeRows } from '@/features/income/data';

import {
  useItemSales,
  useReportExpenses,
  useReportStations,
  useUsageIntervals,
  type ReportStation,
} from './data';

export type ReportModel = {
  range: DateRange;
  previous: DateRange;
  income: IncomeSummary;
  previousIncome: IncomeSummary;
  expenses: ExpenseSummary;
  previousExpenses: ExpenseSummary;
  profit: ProfitSummary;
  previousProfit: ProfitSummary;
  utilization: UtilizationReport;
  heatmap: Heatmap;
  stations: ReportStation[];
  customers: CustomerTotal[];
  sales: ItemSalesSummary;
  /** One line per branch (only when all branches are shown). */
  branches: BranchFigures[];
};

const NONE: [string, string] = ['', ''];

/**
 * Everything the reports screen and the export show, for one period (and the one before it)
 * and an optional branch. Returns null until the range is valid.
 */
export function useReport(input: {
  orgId: string | null | undefined;
  timeZone: string;
  range: DateRange | null;
  previous: DateRange | null;
  branchId: string | null;
  /** Branch ids for the comparison (all branches view only). */
  branchIds: readonly string[];
  now: number;
}): ReportModel | null {
  const { orgId, timeZone, range, previous, branchId, now } = input;
  const valid = range && previous ? { range, previous } : null;

  // One query covers both periods (the previous one ends where this one starts).
  const both = valid ? utcDateWindow({ start: valid.previous.start, end: valid.range.end }) : NONE;
  const current = valid ? utcDateWindow(valid.range) : NONE;
  const { data: rows } = useIncomeRows(orgId, both);
  const expenseRows = useReportExpenses(
    orgId,
    valid?.previous.fromDate ?? '',
    valid?.range.toDate ?? '',
  );
  const intervals = useUsageIntervals(orgId, current);
  const stations = useReportStations(orgId);
  const items = useItemSales(orgId, current);

  if (!valid) return null;
  const filter = { branchId };
  const entries = rows.map(toIncomeEntry);
  const income = summarizeIncome(entries, valid.range, timeZone, filter);
  const previousIncome = summarizeIncome(entries, valid.previous, timeZone, filter);
  const expenses = summarizeExpenses(expenseRows, valid.range, branchId);
  const previousExpenses = summarizeExpenses(expenseRows, valid.previous, branchId);
  const utilization = summarizeUtilization(intervals, stations, valid.range, now, filter);

  return {
    ...valid,
    income,
    previousIncome,
    expenses,
    previousExpenses,
    profit: netProfit(income.net, expenses.total),
    previousProfit: netProfit(previousIncome.net, previousExpenses.total),
    utilization,
    heatmap: occupancyHeatmap(intervals, valid.range, now, timeZone, filter),
    stations: stations.filter((s) => !branchId || s.branchId === branchId),
    customers: topCustomers(entries, valid.range, filter),
    sales: summarizeItemSales(items, valid.range, filter),
    branches: branchId
      ? []
      : compareBranches(
          input.branchIds,
          income.byBranch,
          expenseRows,
          valid.range,
          utilization.byBranch,
        ),
  };
}
