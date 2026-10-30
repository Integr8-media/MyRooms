import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatMoney } from '@/domain/money';

import { FloorScreen } from './FloorScreen';
import { SessionScreen } from './SessionScreen';
import { StartSessionScreen } from './StartSessionScreen';

// Monday 5 Jan 2026, 14:30 in Cairo (UTC+2).
const NOW = Date.UTC(2026, 0, 5, 12, 30);
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

const mockRules = [
  {
    id: 'base',
    org_id: 'org',
    station_type_id: 'ps5',
    name: 'Base',
    price_per_hour: 6000,
    days_of_week: 127,
    priority: 0,
  },
];
const mockPackages = [
  {
    id: 'p2',
    org_id: 'org',
    station_type_id: 'ps5',
    name: '2 hours',
    minutes: 120,
    price: 10000,
    is_active: 1,
  },
];
const station = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  status: 'active',
  sort_order: 0,
  type_id: 'ps5',
  type_name: 'PS5 Room',
  type_color: '#2563eb',
  type_kind: 'ps_room',
  max_players: 4,
  session_id: null,
  session_kind: null,
  actual_start: null,
  scheduled_end: null,
  package_id: null,
  note: null,
  ...extra,
});
const mockFloor = [
  station('free', 'Room 1'),
  // Open session, 30 minutes in, 2 players: 30 EGP so far.
  station('open', 'Room 2', { session_id: 's-open', session_kind: 'open', actual_start: iso(-30) }),
  // Fixed session ending in 3 minutes.
  station('soon', 'Room 3', {
    session_id: 's-soon',
    session_kind: 'fixed',
    actual_start: iso(-57),
    scheduled_end: iso(3),
  }),
  // Fixed session 10 minutes over.
  station('over', 'Room 4', {
    session_id: 's-over',
    session_kind: 'fixed',
    actual_start: iso(-70),
    scheduled_end: iso(-10),
  }),
  station('fix', 'Room 5', { status: 'maintenance' }),
];
const mockSegments = [
  {
    id: 'g1',
    session_id: 's-open',
    station_type_id: 'ps5',
    players: 2,
    started_at: iso(-30),
    ended_at: null,
  },
  {
    id: 'g2',
    session_id: 's-soon',
    station_type_id: 'ps5',
    players: 1,
    started_at: iso(-57),
    ended_at: null,
  },
  {
    id: 'g3',
    session_id: 's-over',
    station_type_id: 'ps5',
    players: 1,
    started_at: iso(-70),
    ended_at: null,
  },
];
const mockSession = {
  id: 's-open',
  org_id: 'org',
  branch_id: 'A',
  station_id: 'open',
  kind: 'open',
  status: 'active',
  package_id: null,
  actual_start: iso(-30),
  scheduled_end: null,
  actual_end: null,
  note: 'Ahmed',
};

// Phase 7 modules.
let mockItems: object[] = [];
const mockCustomers = [
  {
    id: 'c1',
    org_id: 'org',
    name: 'Omar',
    phone: '01001234567',
    default_discount_pct: 10,
    is_active: 1,
  },
];

// Reservations not checked in yet (useReserved).
let mockReserved: object[] = [];
const reservation = (id: string, stationId: string, from: number, to: number) => ({
  id,
  station_id: stationId,
  scheduled_start: iso(from),
  scheduled_end: iso(to),
  customer_name: 'Mona',
  players: 2,
  station_name: 'Room',
});

let mockRole: 'owner' | 'manager' | 'cashier' = 'cashier';
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => {
    if (sql.includes("x.status = 'reserved'")) return { data: mockReserved, isLoading: false };
    if (sql.includes('FROM session_items WHERE session_id')) return { data: mockItems };
    if (sql.includes('FROM customers WHERE org_id')) return { data: mockCustomers };
    const data = sql.includes('LEFT JOIN sessions x ON x.station_id')
      ? mockFloor
      : sql.includes('FROM session_segments g JOIN sessions')
        ? mockSegments
        : sql.includes('FROM session_segments g')
          ? [{ ...mockSegments[0], station_name: 'Room 2', type_name: 'PS5 Room' }]
          : sql.includes('FROM rate_rules')
            ? mockRules
            : sql.includes('FROM packages')
              ? mockPackages
              : sql.includes('SELECT * FROM sessions WHERE id')
                ? [mockSession]
                : sql.includes('busy_session_id')
                  ? [
                      {
                        id: 'free',
                        name: 'Room 1',
                        status: 'active',
                        is_active: 1,
                        branch_id: 'A',
                        station_type_id: 'ps5',
                        type_name: 'PS5 Room',
                        max_players: 4,
                        busy_session_id: null,
                      },
                    ]
                  : sql.includes('FROM stations s LEFT JOIN station_types')
                    ? [
                        {
                          name: 'Room 2',
                          station_type_id: 'ps5',
                          status: 'active',
                          type_name: 'PS5 Room',
                          max_players: 4,
                        },
                      ]
                    : [];
    return { data, isLoading: false };
  },
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    branch: { id: 'A', name: 'Branch A' },
    branches: [{ id: 'A', name: 'Branch A', is_active: 1 }],
    features: { customers: true, snacks: true, expenses: true },
    role: mockRole,
    membership: { display_name: 'Sara' },
    can: (p: string) => p !== 'sessions.cancel' || mockRole !== 'cashier',
  }),
}));
jest.mock('@/features/sync/SyncBadge', () => ({ SyncBadge: () => null }));
jest.mock('@/features/sync/SyncNotices', () => ({ SyncNotices: () => null }));
jest.mock('@/features/checkout/UnpaidList', () => ({ UnpaidList: () => null }));
jest.mock('@/features/sync/RejectedChanges', () => ({ RejectedChanges: () => null }));
jest.mock('@/lib/powersync/database', () => ({ powersync: {} }));
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    back: () => mockBack(),
    replace: (...a: unknown[]) => mockReplace(...a),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/features/customers/api', () => ({
  setSessionCustomer: (...a: unknown[]) => mockSetCustomer(...a),
}));
const mockSetCustomer = jest.fn(async (..._a: unknown[]) => {});
const mockStart = jest.fn(async (..._a: unknown[]) => 'new-id');
const mockEnd = jest.fn(async (..._a: unknown[]) => {});
jest.mock('./api', () => ({
  startSession: (...a: unknown[]) => mockStart(...a),
  endSession: (...a: unknown[]) => mockEnd(...a),
  cancelSession: jest.fn(),
  extendSession: jest.fn(),
  changePlayers: jest.fn(),
  moveSession: jest.fn(),
}));

const money = (piasters: number) => formatMoney(piasters, 'en');

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockRole = 'cashier';
  mockItems = [];
  mockParams = {};
  mockReserved = [];
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('FloorScreen', () => {
  it('shows every station with its live status, timer and running cost', async () => {
    await render(<FloorScreen />);
    expect(screen.getByLabelText(/^Room 1, Free/)).toBeTruthy();
    expect(screen.getByLabelText('Room 2, Playing, Played 30:00')).toBeTruthy();
    expect(screen.getByLabelText('Room 3, Ending soon, Left 3:00')).toBeTruthy();
    expect(screen.getByLabelText('Room 4, Over time, Over by -10:00')).toBeTruthy();
    expect(screen.getByLabelText(/^Room 5, Maintenance/)).toBeTruthy();
    expect(screen.getByText(money(3000))).toBeTruthy(); // 30 min at 60 EGP/h
    expect(screen.getByText('Players: 2')).toBeTruthy();
    expect(screen.getByText('Free: 1')).toBeTruthy();
  });

  it('opens the start screen for a free station and the session for a busy one', async () => {
    await render(<FloorScreen />);
    await fireEvent.press(screen.getByTestId('station-card-free'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/sessions/start',
      params: { stationId: 'free' },
    });
    await fireEvent.press(screen.getByTestId('station-card-open'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/sessions/[id]',
      params: { id: 's-open' },
    });
  });

  it('shows "reserved soon" 30 minutes ahead and opens the reservation', async () => {
    mockReserved = [reservation('r1', 'free', 20, 80), reservation('r2', 'open', 25, 85)];
    await render(<FloorScreen />);
    expect(screen.getByLabelText(/^Room 1, Reserved soon/)).toBeTruthy();
    expect(screen.getByTestId('station-card-free-reservation')).toHaveTextContent(
      'Reserved 14:50 Mona',
    );
    // The open session on Room 2 is warned that a booking is coming.
    expect(screen.getByTestId('station-card-open-reservation')).toHaveTextContent(/14:55/);
    expect(screen.getByTestId('arrivals')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('station-card-free'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/reservations/[id]',
      params: { id: 'r1' },
    });
  });

  it('a reservation later in the day leaves the station free', async () => {
    mockReserved = [reservation('r1', 'free', 45, 105)];
    await render(<FloorScreen />);
    expect(screen.getByLabelText(/^Room 1, Free/)).toBeTruthy();
    expect(screen.queryByTestId('station-card-free-reservation')).toBeNull();
  });

  it('a station in maintenance cannot be started', async () => {
    await render(<FloorScreen />);
    await fireEvent.press(screen.getByTestId('station-card-fix'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('StartSessionScreen', () => {
  beforeEach(() => {
    mockParams = { stationId: 'free' };
  });

  it('starts an open session with the chosen players', async () => {
    await render(<StartSessionScreen />);
    expect(screen.getByTestId('start-rate')).toHaveTextContent(/60\.00/);
    await fireEvent.press(screen.getByTestId('players-increase'));
    await fireEvent.press(screen.getByTestId('start-session'));
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 'free', kind: 'open', players: 2, packageId: null }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('a fixed session with a package shows the package price and end time', async () => {
    await render(<StartSessionScreen />);
    await fireEvent.press(screen.getByText('Fixed time'));
    await fireEvent.press(screen.getByTestId('package-p2'));
    expect(screen.getByTestId('start-estimate-total')).toHaveTextContent(money(10000), {
      exact: false,
    });
    expect(screen.getByText(/Ends at 16:30/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('start-session'));
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'fixed', packageId: 'p2', minutes: null }),
    );
  });

  it('starts the session for a customer found by phone', async () => {
    await render(<StartSessionScreen />);
    await fireEvent.changeText(screen.getByTestId('customer-search'), '0100 123');
    await fireEvent.press(screen.getByTestId('customer-result-c1'));
    expect(screen.getByTestId('customer-selected')).toHaveTextContent('Omar');
    await fireEvent.press(screen.getByTestId('start-session'));
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1' }));
  });

  it('warns when a walk-in would run into the next reservation', async () => {
    mockReserved = [reservation('r1', 'free', 60, 120)];
    await render(<StartSessionScreen />);
    expect(screen.getByTestId('next-reservation')).toHaveTextContent(/Next reservation.*15:30/);
    await fireEvent.press(screen.getByText('Fixed time'));
    await fireEvent.press(screen.getByTestId('duration-90'));
    expect(screen.getByTestId('next-reservation')).toHaveTextContent(/must end before/);
    await fireEvent.press(screen.getByTestId('duration-60'));
    expect(screen.getByTestId('next-reservation')).toHaveTextContent(/Next reservation/);
  });

  it('a fixed session with a quick duration is priced by the rate rules', async () => {
    await render(<StartSessionScreen />);
    await fireEvent.press(screen.getByText('Fixed time'));
    await fireEvent.press(screen.getByTestId('duration-90'));
    expect(screen.getByTestId('start-estimate-total')).toHaveTextContent(money(9000), {
      exact: false,
    });
  });
});

describe('SessionScreen', () => {
  beforeEach(() => {
    mockParams = { id: 's-open' };
  });

  it('shows the timer and the bill so far, and ends after confirming', async () => {
    await render(<SessionScreen />);
    expect(screen.getByTestId('session-timer')).toHaveTextContent('30:00');
    expect(screen.getByTestId('session-total')).toHaveTextContent(money(3000));
    expect(screen.getByText('Ahmed')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('end-session'));
    expect(mockEnd).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm-close'));
    expect(mockEnd).toHaveBeenCalledWith('s-open');
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/checkout/[id]',
      params: { id: 's-open' },
    });
  });

  it('adds snacks to the bill so far and links a customer', async () => {
    mockItems = [
      {
        id: 'i1',
        session_id: 's-open',
        product_id: 'cola',
        name: 'Cola',
        quantity: 2,
        unit_price: 1500,
      },
    ];
    await render(<SessionScreen />);
    expect(screen.getByTestId('items-total')).toHaveTextContent(money(3000));
    // 30 minutes at 60 EGP/h + 2 colas.
    expect(screen.getByTestId('session-total')).toHaveTextContent(money(6000));

    await fireEvent.changeText(screen.getByTestId('customer-search'), 'om');
    await fireEvent.press(screen.getByTestId('customer-result-c1'));
    expect(mockSetCustomer).toHaveBeenCalledWith('s-open', 'c1');
  });

  it('only owners and managers can cancel', async () => {
    await render(<SessionScreen />);
    expect(screen.queryByTestId('cancel-session')).toBeNull();
    mockRole = 'manager';
    await render(<SessionScreen />);
    expect(screen.getByTestId('cancel-session')).toBeTruthy();
  });
});
