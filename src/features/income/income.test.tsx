import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatMoney } from '@/domain/money';

import { IncomeScreen } from './IncomeScreen';

// Monday 5 Jan 2026, 14:00 in Cairo (UTC+2). The week (from Saturday) starts on the 3rd.
const cairo = (d: number, h: number) => new Date(Date.UTC(2026, 0, d, h - 2)).toISOString();
const mockNow = Date.UTC(2026, 0, 5, 12);

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'payment',
  method: 'cash',
  amount: 10000,
  paid_at: cairo(5, 13),
  branch_id: 'A',
  received_by: 'cashier1',
  bill_status: 'paid',
  bill_number: 7,
  station_name: 'Room 2',
  station_type_id: 'ps5',
  ...over,
});

const mockRows = [
  row('p1'),
  row('p2', { method: 'visa', amount: 6000, received_by: 'manager1' }),
  row('p3', { method: 'instapay', amount: 4000, branch_id: 'B', station_type_id: 'pc' }),
  row('p4', { kind: 'refund', amount: 1000, received_by: 'manager1' }),
  // Not counted: void bill, and yesterday (Sunday) is outside "today" but inside "this week".
  row('p5', { amount: 50000, bill_status: 'void' }),
  row('p6', { amount: 2000, paid_at: cairo(4, 20) }),
];

let mockRole: 'owner' | 'manager' | 'cashier' = 'owner';

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => ({
    data: sql.includes('FROM payments p')
      ? mockRows
      : sql.includes('FROM station_types')
        ? [
            { id: 'ps5', name: 'PS5 Room' },
            { id: 'pc', name: 'VIP PC' },
          ]
        : [],
    isLoading: false,
  }),
}));
jest.mock('@/features/sessions/data', () => ({ useNow: () => mockNow }));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    userId: mockRole === 'cashier' ? 'cashier1' : 'owner1',
    branches: [
      { id: 'A', name: 'Nasr City' },
      { id: 'B', name: 'Maadi' },
    ],
    role: mockRole,
    can: (p: string) => p !== 'income.view' || mockRole !== 'cashier',
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const money = (piasters: number) => formatMoney(piasters, 'en');

beforeEach(() => {
  mockRole = 'owner';
});

describe('IncomeScreen (owner)', () => {
  it("shows today's income by method, branch and station type, without void bills", async () => {
    await render(<IncomeScreen />);
    // 100 + 60 + 40 − 10 refund = 190 EGP.
    expect(screen.getByTestId('income-total')).toHaveTextContent(money(19000));
    expect(screen.getByTestId('income-counts')).toHaveTextContent(
      `Payments: 3 · received ${money(20000)} · Refunds: 1 · given back ${money(1000)}`,
    );
    expect(screen.getByTestId('method-cash-amount')).toHaveTextContent(money(9000));
    expect(screen.getByTestId('method-visa-amount')).toHaveTextContent(money(6000));
    expect(screen.getByTestId('method-instapay-amount')).toHaveTextContent(money(4000));
    expect(screen.getByTestId('branch-A-amount')).toHaveTextContent(money(15000));
    expect(screen.getByTestId('branch-B-amount')).toHaveTextContent(money(4000));
    expect(screen.getAllByText('Maadi')).toHaveLength(2);
    expect(screen.getByTestId('type-ps5-amount')).toHaveTextContent(money(15000));
    expect(screen.getByText('VIP PC')).toBeTruthy();
    // One day: no per-day list.
    expect(screen.queryByTestId('income-by-day')).toBeNull();
  });

  it('filters to one branch', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getAllByText('Maadi')[0]!);
    expect(screen.getByTestId('income-total')).toHaveTextContent(money(4000));
    expect(screen.queryByTestId('income-by-branch')).toBeNull();
  });

  it('this week adds earlier days and lists every day of the week', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getByText('This week'));
    expect(screen.getByTestId('income-total')).toHaveTextContent(money(21000));
    expect(screen.getByTestId('day-2026-01-04-amount')).toHaveTextContent(money(2000));
    expect(screen.getByTestId('day-2026-01-03-amount')).toHaveTextContent(money(0));
    expect(screen.getByTestId('day-2026-01-09')).toBeTruthy();
  });

  it('checks a custom range before showing it', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(screen.getByText('Custom'));
    await fireEvent.changeText(screen.getByTestId('income-from'), '2026-01-06');
    expect(screen.getByTestId('range-error')).toHaveTextContent(
      'The end date is before the start date.',
    );
    expect(screen.queryByTestId('income-total')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('income-from'), '2026-01-04');
    expect(screen.getByTestId('income-total')).toHaveTextContent(money(21000));
  });
});

describe('IncomeScreen (cashier)', () => {
  beforeEach(() => {
    mockRole = 'cashier';
  });

  it('shows only the money they took themselves today', async () => {
    await render(<IncomeScreen />);
    expect(screen.getByText('My shift')).toBeTruthy();
    // p1 (cash 100) and p3 (Instapay 40, other branch); not the manager's or the void bill.
    expect(screen.getByTestId('income-total')).toHaveTextContent(money(14000));
    expect(screen.getByTestId('method-cash-amount')).toHaveTextContent(money(10000));
    expect(screen.getByTestId('method-visa-amount')).toHaveTextContent(money(0));
    expect(screen.getByTestId('payment-p1')).toHaveTextContent(/13:00 · Room 2 · Receipt #7/);
    expect(screen.queryByTestId('payment-p2')).toBeNull();
    expect(screen.queryByTestId('payment-p5')).toBeNull();
    expect(screen.queryByTestId('payment-p6')).toBeNull();
    // No other periods, branches or breakdowns.
    expect(screen.queryByText('This week')).toBeNull();
    expect(screen.queryByTestId('income-by-branch')).toBeNull();
    expect(screen.queryByTestId('income-by-type')).toBeNull();
  });
});
