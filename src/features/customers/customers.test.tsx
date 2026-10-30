import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { formatMoney } from '@/domain/money';
import type { CustomerRow } from '@/lib/powersync/schema';

import { CustomerPicker } from './CustomerPicker';
import { CustomerScreen } from './CustomerScreen';
import { CustomersScreen } from './CustomersScreen';

const mockCustomers = [
  {
    id: 'c1',
    org_id: 'org',
    name: 'Omar Hassan',
    phone: '01001234567',
    notes: null,
    default_discount_pct: 10,
    is_active: 1,
  },
  {
    id: 'c2',
    org_id: 'org',
    name: 'Sara',
    phone: '+20 112 555 0000',
    notes: 'Plays FIFA',
    default_discount_pct: 0,
    is_active: 1,
  },
];
const mockVisits = [
  {
    id: 'v1',
    status: 'completed',
    actual_start: '2026-10-30T12:00:00.000Z',
    station_name: 'Room 1',
    bill_id: 'v1',
    bill_status: 'paid',
    total: 10800,
  },
  {
    id: 'v2',
    status: 'completed',
    actual_start: '2026-10-29T12:00:00.000Z',
    station_name: 'Room 2',
    bill_id: 'v2',
    bill_status: 'void',
    total: 5000,
  },
  {
    id: 'v3',
    status: 'reserved',
    scheduled_start: '2026-11-02T16:00:00.000Z',
    station_name: 'Room 1',
    bill_id: null,
    bill_status: null,
    total: null,
  },
];
let mockRole: 'owner' | 'manager' | 'cashier' = 'cashier';
let mockParams: Record<string, string> = {};

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string, params: unknown[]) => {
    if (sql.includes('FROM customers WHERE org_id')) return { data: mockCustomers };
    if (sql.includes('FROM customers WHERE id')) {
      return { data: mockCustomers.filter((c) => c.id === params[0]) };
    }
    if (sql.includes('WHERE x.customer_id')) return { data: mockVisits };
    return { data: [], isLoading: false };
  },
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    branch: { id: 'A', name: 'Branch A' },
    role: mockRole,
    features: { customers: true, snacks: true, expenses: true },
    can: (p: string) => p === 'customers.manage' || mockRole !== 'cashier',
  }),
}));
jest.mock('@/lib/powersync/database', () => ({ powersync: {} }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    back: jest.fn(),
    replace: (...a: unknown[]) => mockReplace(...a),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
const mockSave = jest.fn(async (..._a: unknown[]) => 'c-new');
jest.mock('./api', () => ({
  saveCustomer: (...a: unknown[]) => mockSave(...a),
  setCustomerActive: jest.fn(),
}));

const mockPicked = jest.fn();
function Harness() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <CustomerPicker
      value={value}
      onChange={(c: CustomerRow | null) => {
        mockPicked(c);
        setValue(c?.id ?? null);
      }}
    />
  );
}

beforeEach(() => {
  mockRole = 'cashier';
  mockParams = {};
  jest.clearAllMocks();
});

describe('CustomerPicker', () => {
  it('finds a customer by phone and picks them', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId('customer-search'), '0112 555');
    await fireEvent.press(screen.getByTestId('customer-result-c2'));
    expect(mockPicked).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
    expect(screen.getByTestId('customer-selected')).toHaveTextContent('Sara');

    await fireEvent.press(screen.getByTestId('customer-clear'));
    expect(mockPicked).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('customer-search')).toBeTruthy();
  });

  it('adds a new customer with the typed phone, and warns about a known number', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId('customer-search'), '01099990000');
    expect(screen.getByText('No customer found.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('customer-add-new'));
    expect(screen.getByTestId('customer-new-phone').props.value).toBe('01099990000');

    // A name is required.
    await fireEvent.press(screen.getByTestId('customer-new-save'));
    expect(mockSave).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('customer-new-phone'), '+20 100 123 4567');
    expect(screen.getByTestId('customer-duplicate')).toHaveTextContent(
      'Omar Hassan already has this phone number.',
    );
    await fireEvent.changeText(screen.getByTestId('customer-new-phone'), '01099990000');
    await fireEvent.changeText(screen.getByTestId('customer-new-name'), 'Youssef');
    await fireEvent.press(screen.getByTestId('customer-new-save'));
    expect(mockSave).toHaveBeenCalledWith('org', null, {
      name: 'Youssef',
      phone: '01099990000',
      notes: null,
    });
    expect(mockPicked).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-new' }));
  });

  it('puts typed text into the name', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId('customer-search'), 'Karim');
    await fireEvent.press(screen.getByTestId('customer-add-new'));
    expect(screen.getByTestId('customer-new-name').props.value).toBe('Karim');
    expect(screen.getByTestId('customer-new-phone').props.value).toBe('');
  });
});

describe('CustomersScreen', () => {
  it('lists customers with their discount and searches by name', async () => {
    await render(<CustomersScreen />);
    expect(screen.getByTestId('customer-row-c1')).toHaveTextContent(/10% off/);
    await fireEvent.changeText(screen.getByTestId('customers-search'), 'sar');
    expect(screen.queryByTestId('customer-row-c1')).toBeNull();
    expect(screen.getByTestId('customer-row-c2')).toBeTruthy();
  });
});

describe('CustomerScreen', () => {
  it('cashiers edit details but not the discount; the discount is not sent', async () => {
    mockParams = { id: 'c1' };
    await render(<CustomerScreen />);
    expect(screen.getByTestId('customer-discount').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByTestId('customer-notes'), 'Weekend regular');
    await fireEvent.press(screen.getByTestId('customer-save'));
    expect(mockSave).toHaveBeenCalledWith('org', 'c1', {
      name: 'Omar Hassan',
      phone: '01001234567',
      notes: 'Weekend regular',
    });
  });

  it('managers set the default discount', async () => {
    mockRole = 'manager';
    mockParams = { id: 'c2' };
    await render(<CustomerScreen />);
    await fireEvent.changeText(screen.getByTestId('customer-discount'), '15');
    await fireEvent.press(screen.getByTestId('customer-save'));
    expect(mockSave).toHaveBeenCalledWith(
      'org',
      'c2',
      expect.objectContaining({ discount: 15, notes: 'Plays FIFA' }),
    );
  });

  it('shows visits and what was paid, leaving out void bills', async () => {
    mockParams = { id: 'c1' };
    await render(<CustomerScreen />);
    expect(screen.getByTestId('customer-spent')).toHaveTextContent(
      `Paid visits: 1 · Total: ${formatMoney(10800, 'en')}`,
    );
    await fireEvent.press(screen.getByTestId('visit-v1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/checkout/[id]', params: { id: 'v1' } });
    await fireEvent.press(screen.getByTestId('visit-v3'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reservations/[id]', params: { id: 'v3' } });
  });
});
