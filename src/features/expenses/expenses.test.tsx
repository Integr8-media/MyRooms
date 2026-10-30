import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatMoney } from '@/domain/money';

import { ExpenseScreen } from './ExpenseScreen';
import { ExpensesScreen } from './ExpensesScreen';

// Friday 30 Oct 2026, 14:00 in Cairo.
const NOW = Date.UTC(2026, 9, 30, 12, 0);
const mockExpenses = [
  {
    id: 'e1',
    branch_id: 'A',
    category: 'electricity',
    amount: 250_000,
    method: 'instapay',
    spent_on: '2026-10-30',
    note: 'October bill',
  },
  {
    id: 'e2',
    branch_id: 'A',
    category: 'rent',
    amount: 500_000,
    method: 'cash',
    spent_on: '2026-10-01',
    note: null,
  },
];
let mockRole: 'owner' | 'manager' | 'cashier' = 'manager';
let mockFeatures = { customers: true, snacks: true, expenses: true };
let mockParams: Record<string, string> = {};
let mockQueries: unknown[][] = [];

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string, params: unknown[]) => {
    if (sql.includes('FROM expenses WHERE branch_id')) {
      mockQueries.push(params);
      return { data: mockExpenses.filter((e) => e.spent_on >= String(params[1])) };
    }
    if (sql.includes('FROM expenses WHERE id')) {
      return { data: mockExpenses.filter((e) => e.id === params[0]), isLoading: false };
    }
    return { data: [], isLoading: false };
  },
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    branch: { id: 'A', name: 'Branch A' },
    branches: [{ id: 'A', name: 'Branch A', is_active: 1 }],
    role: mockRole,
    features: mockFeatures,
    can: (p: string) => mockRole !== 'cashier' || p !== 'expenses.manage',
  }),
}));
jest.mock('@/features/workspace/BranchSwitcher', () => ({ BranchSwitcher: () => null }));
jest.mock('@/lib/powersync/database', () => ({ powersync: {} }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: () => mockBack(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
const mockCreate = jest.fn(async (..._a: unknown[]) => {});
const mockUpdate = jest.fn(async (..._a: unknown[]) => {});
const mockDelete = jest.fn(async (..._a: unknown[]) => {});
jest.mock('./api', () => ({
  createExpense: (...a: unknown[]) => mockCreate(...a),
  updateExpense: (...a: unknown[]) => mockUpdate(...a),
  deleteExpense: (...a: unknown[]) => mockDelete(...a),
}));

const money = (piasters: number) => formatMoney(piasters, 'en');

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockRole = 'manager';
  mockFeatures = { customers: true, snacks: true, expenses: true };
  mockParams = {};
  mockQueries = [];
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('ExpensesScreen', () => {
  it("shows this month's expenses by category, and today's", async () => {
    await render(<ExpensesScreen />);
    expect(mockQueries.at(-1)).toEqual(['A', '2026-10-01', '2026-10-31']);
    expect(screen.getByTestId('expenses-total')).toHaveTextContent(money(750_000));
    expect(screen.getByTestId('expenses-by-rent')).toHaveTextContent(money(500_000));
    expect(screen.getByTestId('expense-e1')).toHaveTextContent(/Electricity/);

    await fireEvent.press(screen.getByText('Today'));
    expect(mockQueries.at(-1)).toEqual(['A', '2026-10-30', '2026-10-30']);
    expect(screen.getByTestId('expenses-total')).toHaveTextContent(money(250_000));
  });

  it('is not available to cashiers or when the module is off', async () => {
    mockRole = 'cashier';
    await render(<ExpensesScreen />);
    expect(screen.queryByTestId('expenses-total')).toBeNull();
    expect(screen.getByText(/permission/)).toBeTruthy();

    mockRole = 'manager';
    mockFeatures = { ...mockFeatures, expenses: false };
    await render(<ExpensesScreen />);
    expect(screen.getByText(/switched off/)).toBeTruthy();
  });
});

describe('ExpenseScreen', () => {
  it('records an expense for today in the current branch', async () => {
    mockParams = { id: 'new' };
    await render(<ExpenseScreen />);
    expect(screen.getByTestId('expense-date').props.value).toBe('2026-10-30');
    await fireEvent.changeText(screen.getByTestId('expense-amount'), '150');
    await fireEvent.press(screen.getByTestId('expense-save'));
    // A category is required.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Required.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('expense-category-supplies'));
    await fireEvent.press(screen.getByText('Visa'));
    await fireEvent.press(screen.getByTestId('expense-save'));
    expect(mockCreate).toHaveBeenCalledWith('org', 'A', {
      category: 'supplies',
      amount: 15_000,
      method: 'visa',
      date: '2026-10-30',
      note: null,
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('edits and deletes (after confirming) an expense', async () => {
    mockParams = { id: 'e1' };
    await render(<ExpenseScreen />);
    await fireEvent.changeText(screen.getByTestId('expense-amount'), '2600');
    await fireEvent.press(screen.getByTestId('expense-save'));
    expect(mockUpdate).toHaveBeenCalledWith('e1', expect.objectContaining({ amount: 260_000 }));

    await fireEvent.press(screen.getByTestId('expense-delete'));
    expect(mockDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('expense-confirm-delete'));
    expect(mockDelete).toHaveBeenCalledWith('e1');
  });
});
