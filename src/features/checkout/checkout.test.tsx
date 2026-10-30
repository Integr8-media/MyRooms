import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { getFixedT } from 'i18next';

import { computeFinalBill, rateRuleFromRow } from '@/domain/billing';
import { formatMoney } from '@/domain/money';

import { CheckoutScreen } from './CheckoutScreen';
import { summarizeBill } from './data';
import { receiptHtml } from './receipt';

// Monday 5 Jan 2026, 14:00-15:30 in Cairo (UTC+2): 90 min at 60 EGP/h = 90 EGP.
const START = Date.UTC(2026, 0, 5, 12, 0);
const END = START + 90 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const priced = computeFinalBill({
  segments: [{ stationTypeId: 'ps5', players: 2, startedAt: START, endedAt: END }],
  sessionStart: START,
  sessionEnd: END,
  rules: [
    rateRuleFromRow({
      id: 'base',
      station_type_id: 'ps5',
      price_per_hour: 6000,
      days_of_week: 127,
    }),
  ],
  timeZone: 'Africa/Cairo',
});

const mockSession = {
  id: 's1',
  org_id: 'org',
  branch_id: 'A',
  station_id: 'room2',
  kind: 'open',
  status: 'completed',
  package_id: null,
  actual_start: iso(START),
  actual_end: iso(END),
  note: null,
};
type MockBill = Record<string, unknown> | null;
let mockBill: MockBill;
let mockPayments: Record<string, unknown>[];
let mockRole: 'owner' | 'manager' | 'cashier' = 'cashier';

const baseBill = () => ({
  id: 's1',
  org_id: 'org',
  branch_id: 'A',
  session_id: 's1',
  number: 12,
  time_amount: priced.timeAmount,
  items_amount: 0,
  discount_amount: 0,
  total: priced.timeAmount,
  paid_amount: 0,
  status: 'open',
  details: JSON.stringify(priced.details),
  discount_reason: null,
  void_reason: null,
});

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => {
    const data = sql.includes('FROM sessions WHERE id')
      ? [mockSession]
      : sql.includes('FROM bills WHERE id')
        ? mockBill
          ? [mockBill]
          : []
        : sql.includes('FROM payments p')
          ? mockPayments
          : sql.includes('FROM stations WHERE id')
            ? [{ name: 'Room 2' }]
            : [];
    return { data, isLoading: false };
  },
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    branch: { id: 'A', name: 'Branch A' },
    role: mockRole,
    can: (p: string) =>
      mockRole !== 'cashier' || !['bills.discount', 'bills.refund', 'bills.void'].includes(p),
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 's1' }),
}));
const mockAddPayment = jest.fn(async (..._a: unknown[]) => 'p-new');
const mockDiscount = jest.fn(async (..._a: unknown[]) => {});
const mockVoid = jest.fn(async (..._a: unknown[]) => {});
const mockRefund = jest.fn(async (..._a: unknown[]) => 'r-new');
const mockCreateBill = jest.fn(async (..._a: unknown[]) => {});
jest.mock('./api', () => ({
  addPayment: (...a: unknown[]) => mockAddPayment(...a),
  applyDiscount: (...a: unknown[]) => mockDiscount(...a),
  voidBill: (...a: unknown[]) => mockVoid(...a),
  refund: (...a: unknown[]) => mockRefund(...a),
  createBill: (...a: unknown[]) => mockCreateBill(...a),
}));
const mockShare = jest.fn(async (..._a: unknown[]) => {});
jest.mock('./shareReceipt', () => ({ shareReceipt: (...a: unknown[]) => mockShare(...a) }));

const money = (piasters: number) => formatMoney(piasters, 'en');

beforeEach(() => {
  mockBill = baseBill();
  mockPayments = [];
  mockRole = 'cashier';
  jest.clearAllMocks();
});

describe('CheckoutScreen', () => {
  it('shows the bill and takes the full amount by cash by default', async () => {
    await render(<CheckoutScreen />);
    expect(screen.getByTestId('checkout-total')).toHaveTextContent(money(9000));
    expect(screen.getByTestId('amount-due')).toHaveTextContent(money(9000));
    expect(screen.getByTestId('bill-number')).toHaveTextContent('Receipt #12');
    await fireEvent.press(screen.getByTestId('record-payment'));
    expect(mockAddPayment).toHaveBeenCalledWith({
      billId: 's1',
      method: 'cash',
      amount: 9000,
      reference: '',
    });
  });

  it('shows the change for cash and splits a bill across methods', async () => {
    await render(<CheckoutScreen />);
    await fireEvent.changeText(screen.getByTestId('payment-tendered'), '100');
    expect(screen.getByText(`Change to give: ${money(1000)}`)).toBeTruthy();

    await fireEvent.press(screen.getByText('Instapay'));
    await fireEvent.changeText(screen.getByTestId('payment-amount'), '40');
    await fireEvent.changeText(screen.getByTestId('payment-reference'), 'TX-77');
    expect(screen.getByText('The rest can be paid by another method.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('record-payment'));
    expect(mockAddPayment).toHaveBeenCalledWith({
      billId: 's1',
      method: 'instapay',
      amount: 4000,
      reference: 'TX-77',
    });
  });

  it('does not allow paying more than is due', async () => {
    await render(<CheckoutScreen />);
    await fireEvent.changeText(screen.getByTestId('payment-amount'), '95');
    expect(screen.getByText(/no more than what is due/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('record-payment'));
    expect(mockAddPayment).not.toHaveBeenCalled();
  });

  it('counts local payments and refunds, and shows when the bill is paid', async () => {
    mockPayments = [
      { id: 'p1', kind: 'payment', method: 'cash', amount: 5000, paid_at: iso(END) },
      { id: 'p2', kind: 'payment', method: 'visa', amount: 5000, paid_at: iso(END) },
      { id: 'p3', kind: 'refund', method: 'cash', amount: 1000, paid_at: iso(END) },
    ];
    await render(<CheckoutScreen />);
    expect(screen.getByTestId('paid-notice')).toBeTruthy();
    expect(screen.queryByTestId('payment-form')).toBeNull();
    expect(screen.getAllByText('Paid')).toHaveLength(2); // status badge + paid row
    expect(screen.getByTestId('amount-due')).toHaveTextContent(money(0));
    expect(screen.getByText(`Refund · Cash · −${money(1000)}`)).toBeTruthy();
  });

  it('cashiers cannot discount, refund or void', async () => {
    mockPayments = [{ id: 'p1', kind: 'payment', method: 'cash', amount: 5000 }];
    await render(<CheckoutScreen />);
    expect(screen.queryByTestId('open-discount')).toBeNull();
    expect(screen.queryByTestId('open-refund')).toBeNull();
    expect(screen.queryByTestId('open-void')).toBeNull();
  });

  it('managers give a percent discount before any payment', async () => {
    mockRole = 'manager';
    await render(<CheckoutScreen />);
    await fireEvent.press(screen.getByTestId('open-discount'));
    await fireEvent.press(screen.getByText('Percent'));
    await fireEvent.changeText(screen.getByTestId('discount-value'), '10');
    await fireEvent.changeText(screen.getByTestId('discount-reason'), 'Regular');
    await fireEvent.press(screen.getByTestId('apply-discount'));
    expect(mockDiscount).toHaveBeenCalledWith('s1', 900, 'Regular');
  });

  it('no discount once money was taken', async () => {
    mockRole = 'manager';
    mockPayments = [{ id: 'p1', kind: 'payment', method: 'cash', amount: 1000 }];
    await render(<CheckoutScreen />);
    expect(screen.queryByTestId('open-discount')).toBeNull();
    expect(screen.getByTestId('open-refund')).toBeTruthy();
  });

  it('managers void with a reason, confirmed inline', async () => {
    mockRole = 'manager';
    await render(<CheckoutScreen />);
    await fireEvent.press(screen.getByTestId('open-void'));
    await fireEvent.press(screen.getByTestId('confirm-void'));
    expect(mockVoid).not.toHaveBeenCalled(); // no reason yet
    await fireEvent.changeText(screen.getByTestId('void-reason'), 'Test session');
    await fireEvent.press(screen.getByTestId('confirm-void'));
    expect(mockVoid).toHaveBeenCalledWith('s1', 'Test session');
  });

  it('a void bill takes no payments', async () => {
    mockBill = { ...baseBill(), status: 'void', void_reason: 'Mistake' };
    await render(<CheckoutScreen />);
    expect(screen.getByTestId('void-notice')).toHaveTextContent(/Mistake/);
    expect(screen.queryByTestId('payment-form')).toBeNull();
  });

  it('a bill not yet synced has no number', async () => {
    mockBill = { ...baseBill(), number: null };
    await render(<CheckoutScreen />);
    expect(screen.getByTestId('bill-number')).toHaveTextContent('Number given after sync');
  });

  it('an older session without a bill can get one', async () => {
    mockBill = null;
    await render(<CheckoutScreen />);
    await fireEvent.press(screen.getByTestId('create-bill'));
    expect(mockCreateBill).toHaveBeenCalledWith('s1');
  });

  it('prints or shares the receipt', async () => {
    await render(<CheckoutScreen />);
    await fireEvent.press(screen.getByTestId('receipt'));
    expect(mockShare).toHaveBeenCalledWith(expect.stringContaining('Receipt #12'), 'Receipt');
  });
});

describe('receiptHtml', () => {
  const input = (language: string) => ({
    orgName: 'Arena <Gaming>',
    branchName: 'Branch A',
    stationName: 'Room 2',
    number: 12,
    start: START,
    end: END,
    summary: summarizeBill(
      { ...baseBill(), discount_amount: 1000 } as never,
      [
        { kind: 'payment', method: 'visa', amount: 5000 },
        { kind: 'payment', method: 'cash', amount: 3000 },
      ] as never,
    ),
    payments: [
      { kind: 'payment', method: 'visa', amount: 5000 },
      { kind: 'payment', method: 'cash', amount: 3000 },
    ],
    timeZone: 'Africa/Cairo',
    language,
    t: getFixedT(language),
  });

  it('lists the time, discount, payments and status, escaping names', () => {
    const html = receiptHtml(input('en'));
    expect(html).toContain('Arena &lt;Gaming&gt;');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('2026-01-05 14:00');
    expect(html).toContain(`−${money(1000)}`);
    expect(html).toContain(money(8000)); // total
    expect(html).toContain('Paid by Visa');
    expect(html).toContain('>Paid<');
  });

  it('is right-to-left in Arabic', () => {
    const html = receiptHtml(input('ar'));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('إيصال رقم 12');
  });
});
