import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatMoney } from '@/domain/money';
import { IncomeScreen } from '@/features/income/IncomeScreen';

import { shareCsv, sharePdf } from './share';

// Monday 5 Jan 2026, 14:00 in Cairo (UTC+2).
const cairo = (d: number, h: number) => new Date(Date.UTC(2026, 0, d, h - 2)).toISOString();
const mockNow = Date.UTC(2026, 0, 5, 12);

const pay = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'payment',
  method: 'cash',
  amount: 10000,
  paid_at: cairo(5, 13),
  branch_id: 'A',
  received_by: 'u1',
  bill_status: 'paid',
  bill_number: 1,
  station_name: 'Room 1',
  station_type_id: 'ps5',
  bill_id: `bill-${id}`,
  customer_id: null,
  ...over,
});

const mockData: Record<string, unknown[]> = {
  payments: [
    pay('p1', { customer_id: 'c1' }),
    pay('p2', { method: 'visa', amount: 6000, customer_id: 'c2' }),
    pay('p3', { method: 'instapay', amount: 4000, branch_id: 'B', station_type_id: 'pc' }),
    // Yesterday: the previous period for "today".
    pay('p4', { amount: 8000, paid_at: cairo(4, 20), customer_id: 'c2' }),
  ],
  expenses: [
    { branch_id: 'A', category: 'rent', amount: 5000, method: 'cash', spent_on: '2026-01-05' },
    { branch_id: 'B', category: 'internet', amount: 2000, method: 'cash', spent_on: '2026-01-05' },
    { branch_id: 'A', category: 'rent', amount: 1000, method: 'cash', spent_on: '2026-01-04' },
  ],
  segments: [
    { station_id: 'r1', branch_id: 'A', started_at: cairo(5, 10), ended_at: cairo(5, 12) },
    { station_id: 'r2', branch_id: 'A', started_at: cairo(5, 12), ended_at: null },
  ],
  stations: [
    {
      id: 'r1',
      name: 'Room 1',
      branch_id: 'A',
      station_type_id: 'ps5',
      is_active: 1,
      created_at: null,
    },
    {
      id: 'r2',
      name: 'Room 2',
      branch_id: 'A',
      station_type_id: 'ps5',
      is_active: 1,
      created_at: null,
    },
    {
      id: 'pc1',
      name: 'PC 1',
      branch_id: 'B',
      station_type_id: 'pc',
      is_active: 1,
      created_at: null,
    },
  ],
  items: [
    {
      product_id: 'cola',
      name: 'Cola',
      quantity: 2,
      unit_price: 1500,
      created_at: cairo(5, 11),
      branch_id: 'A',
      session_status: 'completed',
      bill_status: 'paid',
    },
    {
      product_id: 'chips',
      name: 'Chips',
      quantity: 1,
      unit_price: 1000,
      created_at: cairo(5, 11),
      branch_id: 'A',
      session_status: 'cancelled',
      bill_status: null,
    },
  ],
  customers: [
    { id: 'c1', name: 'Ahmed', phone: '01000000001' },
    { id: 'c2', name: 'Sara', phone: '01000000002' },
  ],
  products: [{ id: 'cola', name: 'Cola Zero' }],
  types: [
    { id: 'ps5', name: 'PS5 Room' },
    { id: 'pc', name: 'VIP PC' },
  ],
};

const mockTable = (sql: string) =>
  sql.includes('FROM payments p')
    ? 'payments'
    : sql.includes('FROM expenses')
      ? 'expenses'
      : sql.includes('FROM session_segments')
        ? 'segments'
        : sql.includes('FROM stations')
          ? 'stations'
          : sql.includes('FROM session_items')
            ? 'items'
            : sql.includes('FROM customers')
              ? 'customers'
              : sql.includes('FROM products')
                ? 'products'
                : sql.includes('FROM station_types')
                  ? 'types'
                  : '';

let mockFeatures = { customers: true, snacks: true, expenses: true };

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => ({ data: mockData[mockTable(sql)] ?? [], isLoading: false }),
}));
jest.mock('@/features/sessions/data', () => ({ useNow: () => mockNow }));
jest.mock('@/features/reports/share', () => ({ shareCsv: jest.fn(), sharePdf: jest.fn() }));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    userId: 'owner1',
    branches: [
      { id: 'A', name: 'Nasr City' },
      { id: 'B', name: 'Maadi' },
    ],
    role: 'owner',
    features: mockFeatures,
    can: () => true,
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const money = (piasters: number) => formatMoney(piasters, 'en');

beforeEach(() => {
  mockFeatures = { customers: true, snacks: true, expenses: true };
  jest.clearAllMocks();
});

describe('Reports (owner)', () => {
  it('shows net profit and compares with yesterday', async () => {
    await render(<IncomeScreen />);
    expect(screen.getByText('Reports')).toBeTruthy();
    // Income 100 + 60 + 40 = 200; yesterday 80 → +150%.
    expect(screen.getByTestId('income-total')).toHaveTextContent(money(20000));
    expect(screen.getByTestId('income-compared')).toHaveTextContent(
      `Yesterday: ${money(8000)} · +150%`,
    );
    // Expenses 50 + 20 = 70 → profit 130; yesterday 80 − 10 = 70 → +86%.
    expect(screen.getByTestId('profit-expenses')).toHaveTextContent(money(-7000));
    expect(screen.getByTestId('profit-total')).toHaveTextContent(money(13000));
    expect(screen.getByTestId('profit-compared')).toHaveTextContent(
      `Yesterday: ${money(7000)} · +86%`,
    );
    // Branch comparison: profit per branch, with income, expenses and usage.
    expect(screen.getByTestId('branch-A-amount')).toHaveTextContent(money(11000));
    expect(screen.getByTestId('branch-B-amount')).toHaveTextContent(money(2000));
    expect(screen.getByTestId('branch-B')).toHaveTextContent(
      `Income ${money(4000)} · Expenses ${money(2000)} · Usage 0%`,
      { exact: false },
    );
  });

  it('one branch: its own profit, no branch comparison', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getAllByText('Maadi')[0]!);
    expect(screen.getByTestId('profit-total')).toHaveTextContent(money(2000));
    expect(screen.queryByTestId('branch-compare')).toBeNull();
  });

  it('shows station usage and the busiest hours', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getByText('Usage'));
    // 2 h + 2 h (running until now) of 3 stations × 14 h = 10%.
    expect(screen.getByTestId('usage-pct')).toHaveTextContent('10%');
    expect(screen.getByTestId('usage-station-r1-amount')).toHaveTextContent('14%');
    expect(screen.getByTestId('usage-station-r2-amount')).toHaveTextContent('14%');
    expect(screen.getByTestId('usage-type-ps5-amount')).toHaveTextContent('14%');
    expect(screen.getByTestId('heatmap-peak')).toHaveTextContent(
      'Busiest: Mon at 10:00 · stations in use on average: 1',
    );
    expect(screen.getByTestId('heat-1-13')).toBeTruthy();
    expect(screen.queryByTestId('heat-1-9')).toBeNull();
  });

  it('lists top customers and snack sales', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getByText('Customers'));
    expect(screen.getByTestId('customer-c1-amount')).toHaveTextContent(money(10000));
    expect(screen.getByTestId('customer-c2')).toHaveTextContent(/Sara.*01000000002 · Visits: 1/);

    await fireEvent.press(screen.getByText('Snacks & drinks'));
    expect(screen.getByTestId('snack-total')).toHaveTextContent(`Sold: 2 · ${money(3000)}`);
    expect(screen.getByTestId('product-cola')).toHaveTextContent(/Cola Zero/);
    expect(screen.queryByTestId('product-chips')).toBeNull();
  });

  it('exports the whole report as CSV and PDF', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getByTestId('export-csv'));
    expect(shareCsv).toHaveBeenCalledTimes(1);
    const [csv, name] = (shareCsv as jest.Mock).mock.calls[0];
    expect(name).toBe('myrooms-report-2026-01-05');
    expect(csv.startsWith('﻿Arena report')).toBe(true);
    expect(csv).toContain('Net profit,130.00,70.00,+86%');
    expect(csv).toContain('Nasr City,160.00,50.00,110.00,14');
    expect(csv).toContain('Ahmed,01000000001,1,100.00');
    expect(csv).toContain('Cola Zero,2,30.00');

    await fireEvent.press(screen.getByTestId('export-pdf'));
    const [html] = (sharePdf as jest.Mock).mock.calls[0];
    expect(html).toContain('<h1>Arena report</h1>');
    expect(html).toContain('dir="ltr"');
  });

  it('hides switched-off modules', async () => {
    mockFeatures = { customers: false, snacks: false, expenses: false };
    await render(<IncomeScreen />);
    expect(screen.queryByTestId('profit-card')).toBeNull();
    expect(screen.queryByText('Customers')).toBeNull();
    expect(screen.queryByText('Snacks & drinks')).toBeNull();
    expect(screen.getByTestId('branch-B')).toHaveTextContent(`Income ${money(4000)} · Usage 0%`, {
      exact: false,
    });

    await fireEvent.press(screen.getByTestId('export-csv'));
    const [csv] = (shareCsv as jest.Mock).mock.calls[0];
    expect(csv).not.toContain('Net profit');
    expect(csv).not.toContain('Top customers');
    expect(csv).not.toContain('Snack & drink sales');
  });
});
