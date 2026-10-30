import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { CalendarScreen } from '@/features/calendar/CalendarScreen';
import { PX_PER_MINUTE } from '@/features/calendar/DayTimeline';
import { RejectedChanges } from '@/features/sync/RejectedChanges';

import { ReservationFormScreen } from './ReservationFormScreen';
import { ReservationScreen } from './ReservationScreen';

// Monday 5 Jan 2026, 14:30 in Cairo (UTC+2).
const NOW = Date.UTC(2026, 0, 5, 12, 30);
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

const mockStations = [
  {
    id: 'r1',
    name: 'Room 1',
    status: 'active',
    type_id: 'ps5',
    type_name: 'PS5 Room',
    type_kind: 'ps_room',
    type_color: '#2563eb',
    max_players: 4,
  },
  {
    id: 'r2',
    name: 'Room 2',
    status: 'active',
    type_id: 'ps5',
    type_name: 'PS5 Room',
    type_kind: 'ps_room',
    type_color: '#2563eb',
    max_players: 4,
  },
];
const booking = (id: string, station: string, from: number, to: number, extra: object = {}) => ({
  id,
  station_id: station,
  kind: 'reservation',
  status: 'reserved',
  scheduled_start: iso(from),
  scheduled_end: iso(to),
  actual_start: null,
  actual_end: null,
  customer_name: 'Mona',
  players: 2,
  note: null,
  ...extra,
});
let mockBookings: object[] = [];
// The reservation opened on the detail and edit screens.
let mockReservation: object | null = null;
// Live floor rows (which stations are busy right now).
let mockFloor: object[] = [];
let mockRejections: object[] = [];

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => {
    if (sql.includes('FROM customers WHERE org_id')) {
      return {
        data: [
          { id: 'c1', name: 'Omar', phone: '01001234567', default_discount_pct: 0, is_active: 1 },
        ],
        isLoading: false,
      };
    }
    const data = sql.includes('upload_rejections')
      ? mockRejections
      : sql.includes("status IN ('completed', 'no_show')")
        ? mockBookings
        : sql.includes('WHERE x.id = ?')
          ? mockReservation
            ? [mockReservation]
            : []
          : sql.includes('LEFT JOIN sessions x ON x.station_id')
            ? mockFloor
            : sql.includes('FROM stations s JOIN station_types t')
              ? mockStations
              : sql.includes('FROM rate_rules')
                ? [
                    {
                      id: 'base',
                      org_id: 'org',
                      station_type_id: 'ps5',
                      name: 'Base',
                      price_per_hour: 6000,
                      days_of_week: 127,
                      priority: 0,
                    },
                  ]
                : [];
    return { data, isLoading: false };
  },
}));
let mockRole: 'owner' | 'cashier' = 'cashier';
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena', timezone: 'Africa/Cairo' },
    branch: { id: 'A', name: 'Branch A' },
    branches: [{ id: 'A', name: 'Branch A', is_active: 1 }],
    features: { customers: true, snacks: true, expenses: true },
    role: mockRole,
    can: () => true,
  }),
}));
jest.mock('@/features/workspace/BranchSwitcher', () => ({ BranchSwitcher: () => null }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
const mockExecute = jest.fn(async (..._a: unknown[]) => {});
jest.mock('@/lib/powersync/database', () => ({
  powersync: { execute: (...a: unknown[]) => mockExecute(...a) },
}));
const mockCreate = jest.fn(async (..._a: unknown[]) => 'new-res');
const mockUpdate = jest.fn(async (..._a: unknown[]) => {});
const mockCheckIn = jest.fn(async (..._a: unknown[]) => {});
const mockNoShow = jest.fn(async (..._a: unknown[]) => {});
const mockCancel = jest.fn(async (..._a: unknown[]) => {});
jest.mock('./api', () => ({
  createReservation: (...a: unknown[]) => mockCreate(...a),
  updateReservation: (...a: unknown[]) => mockUpdate(...a),
  checkIn: (...a: unknown[]) => mockCheckIn(...a),
  markNoShow: (...a: unknown[]) => mockNoShow(...a),
  cancelReservation: (...a: unknown[]) => mockCancel(...a),
}));

const floorRow = (id: string, name: string, sessionId: string | null = null) => ({
  id,
  name,
  status: 'active',
  type_id: 'ps5',
  type_name: 'PS5 Room',
  type_color: null,
  max_players: 4,
  session_id: sessionId,
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockBookings = [];
  mockReservation = null;
  mockFloor = [floorRow('r1', 'Room 1'), floorRow('r2', 'Room 2')];
  mockRejections = [];
  mockParams = {};
  mockRole = 'cashier';
});
afterEach(() => jest.useRealTimers());

describe('CalendarScreen (day view)', () => {
  it('shows reservations and walk-ins on their station rows', async () => {
    mockBookings = [
      booking('res', 'r1', 210, 300),
      booking('walk', 'r2', -60, 30, {
        kind: 'fixed',
        status: 'active',
        actual_start: iso(-60),
        customer_name: null,
      }),
    ];
    await render(<CalendarScreen />);
    expect(screen.getByTestId('calendar-date')).toHaveTextContent(/Jan 5, 2026/);
    expect(screen.getByLabelText('Mona, 18:00–19:30, Reserved')).toBeTruthy();
    expect(screen.getByLabelText('Walk-in, 13:30–15:00, Playing')).toBeTruthy();
    expect(screen.getByTestId('now-line')).toBeTruthy();
  });

  it('books an empty slot by tapping it (snapped to 15 minutes)', async () => {
    await render(<CalendarScreen />);
    await fireEvent.press(screen.getByTestId('timeline-row-r2'), {
      nativeEvent: { locationX: (18 * 60 + 7) * PX_PER_MINUTE },
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reservations/new',
      params: { stationId: 'r2', date: '2026-01-05', time: '18:00' },
    });
  });

  it('a tap selects a reservation (so it can be dragged) and a second tap opens it', async () => {
    mockBookings = [booking('res', 'r1', 210, 300)];
    await render(<CalendarScreen />);
    await fireEvent.press(screen.getByTestId('block-res'));
    expect(screen.getByTestId('selection-bar')).toHaveTextContent(/Mona, 18:00–19:30/);
    expect(screen.getByTestId('block-res-resize')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('selection-open'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reservations/[id]',
      params: { id: 'res' },
    });
  });

  it('steps through days and flags bookings that overlap', async () => {
    mockBookings = [booking('a', 'r1', 210, 300), booking('b', 'r1', 240, 330)];
    await render(<CalendarScreen />);
    expect(screen.getByText(/Some bookings overlap/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('calendar-next'));
    expect(screen.getByTestId('calendar-date')).toHaveTextContent(/Jan 6, 2026/);
    await fireEvent.press(screen.getByTestId('calendar-today'));
    expect(screen.getByTestId('calendar-date')).toHaveTextContent(/Jan 5, 2026/);
  });
});

describe('ReservationFormScreen', () => {
  it('books the slot picked on the calendar', async () => {
    mockParams = { stationId: 'r1', date: '2026-01-05', time: '18:00' };
    await render(<ReservationFormScreen />);
    await fireEvent.press(screen.getByTestId('save-reservation'));
    expect(screen.getByText('Required.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('reservation-name'), 'Mona');
    await fireEvent.press(screen.getByTestId('length-90'));
    // 90 minutes at 60 EGP/h.
    expect(screen.getByTestId('reservation-summary')).toHaveTextContent(/18:00–19:30/);
    expect(screen.getByTestId('reservation-summary')).toHaveTextContent(/90\.00/);
    await fireEvent.press(screen.getByTestId('save-reservation'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stationId: 'r1',
        start: Date.UTC(2026, 0, 5, 16),
        end: Date.UTC(2026, 0, 5, 17, 30),
        players: 1,
        customerName: 'Mona',
        customerPhone: null,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/reservations/[id]',
      params: { id: 'new-res' },
    });
  });

  it('books for a customer picked from the list (name and phone filled in)', async () => {
    mockParams = { stationId: 'r1', date: '2026-01-05', time: '18:00' };
    await render(<ReservationFormScreen />);
    await fireEvent.changeText(screen.getByTestId('customer-search'), 'omar');
    await fireEvent.press(screen.getByTestId('customer-result-c1'));
    expect(screen.getByTestId('reservation-name').props.value).toBe('Omar');
    expect(screen.getByTestId('reservation-phone').props.value).toBe('01001234567');
    await fireEvent.press(screen.getByTestId('save-reservation'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Omar',
        customerPhone: '01001234567',
        customerId: 'c1',
      }),
    );
  });

  it('refuses a slot that is already booked', async () => {
    mockBookings = [booking('other', 'r1', 240, 300)];
    mockParams = { stationId: 'r1', date: '2026-01-05', time: '18:00', name: 'Ali' };
    await render(<ReservationFormScreen />);
    expect(screen.getByTestId('reservation-conflict')).toHaveTextContent(/18:30–19:30/);
    await fireEvent.press(screen.getByTestId('save-reservation'));
    expect(mockCreate).not.toHaveBeenCalled();
    // Another station is free.
    await fireEvent.press(screen.getByTestId('station-r2'));
    expect(screen.queryByTestId('reservation-conflict')).toBeNull();
  });

  it('edits a reservation and removes a redone booking from the "not saved" list', async () => {
    mockReservation = { ...booking('res', 'r1', 210, 300), customer_phone: '010' };
    mockBookings = [mockReservation];
    mockParams = { id: 'res', rejected: 'rej-1' };
    await render(<ReservationFormScreen />);
    expect(screen.getByTestId('reservation-time')).toHaveProp('value', '18:00');
    // Its own slot is not a conflict.
    expect(screen.queryByTestId('reservation-conflict')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('reservation-time'), '19:00');
    await fireEvent.press(screen.getByTestId('save-reservation'));
    expect(mockUpdate).toHaveBeenCalledWith(
      'res',
      expect.objectContaining({ start: Date.UTC(2026, 0, 5, 17), players: 2 }),
    );
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM upload_rejections WHERE id = ?', [
      'rej-1',
    ]);
  });
});

describe('ReservationScreen', () => {
  it('checks the customer in and opens the session', async () => {
    mockReservation = { ...booking('res', 'r1', -5, 55), station_status: 'active' };
    mockParams = { id: 'res' };
    await render(<ReservationScreen />);
    // 10 minutes into the grace period: no no-show yet.
    expect(screen.getByTestId('no-show-hint')).toHaveTextContent(/from 14:40/);
    expect(screen.queryByTestId('no-show')).toBeNull();
    await fireEvent.press(screen.getByTestId('check-in'));
    expect(mockCheckIn).toHaveBeenCalledWith('res', undefined);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/sessions/[id]', params: { id: 'res' } });
  });

  it('checks in on another free station when the booked one is still busy', async () => {
    mockReservation = { ...booking('res', 'r1', 0, 60), station_status: 'active' };
    mockFloor = [floorRow('r1', 'Room 1', 'walk-in'), floorRow('r2', 'Room 2')];
    mockParams = { id: 'res' };
    await render(<ReservationScreen />);
    expect(screen.queryByTestId('check-in')).toBeNull();
    await fireEvent.press(screen.getByTestId('check-in-elsewhere'));
    await fireEvent.press(screen.getByTestId('check-in-at-r2'));
    expect(mockCheckIn).toHaveBeenCalledWith('res', 'r2');
  });

  it('marks a no-show after the grace period, and cancels after confirming', async () => {
    mockReservation = { ...booking('res', 'r1', -20, 40), station_status: 'active' };
    mockParams = { id: 'res' };
    await render(<ReservationScreen />);
    expect(screen.getByText('Late')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('no-show'));
    expect(mockNoShow).toHaveBeenCalledWith('res');

    await fireEvent.press(screen.getByTestId('cancel-reservation'));
    expect(mockCancel).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm-cancel-reservation'));
    expect(mockCancel).toHaveBeenCalledWith('res');
  });
});

describe('RejectedChanges', () => {
  it('says what the server refused and lets staff book it again or dismiss it', async () => {
    mockRejections = [
      {
        id: 'rej-1',
        table_name: 'sessions',
        op: 'PUT',
        row_id: 'lost',
        error: 'booking_conflict',
        station_name: 'Room 1',
        data: JSON.stringify(booking('lost', 'r1', 210, 300, { customer_phone: '010' })),
      },
      {
        id: 'rej-2',
        table_name: 'sessions',
        op: 'PUT',
        row_id: 'w',
        error: 'station_busy',
        station_name: 'Room 2',
        data: JSON.stringify({ kind: 'open', station_id: 'r2', actual_start: iso(0) }),
      },
    ];
    await render(<RejectedChanges />);
    expect(screen.getByText('Not saved (2)')).toBeTruthy();
    expect(screen.getByTestId('rejected-rej-1')).toHaveTextContent(/Reservation not saved/);
    expect(screen.getByTestId('rejected-rej-1')).toHaveTextContent(/Room 1 · .*18:00–19:30 · Mona/);
    expect(screen.getByTestId('rejected-rej-1')).toHaveTextContent(/already booked/);
    expect(screen.getByTestId('rejected-rej-2')).toHaveTextContent(/Walk-in session not saved/);
    expect(screen.queryByTestId('book-again-rej-2')).toBeNull();

    await fireEvent.press(screen.getByTestId('book-again-rej-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reservations/new',
      params: {
        stationId: 'r1',
        date: '2026-01-05',
        time: '18:00',
        minutes: '90',
        players: '2',
        name: 'Mona',
        phone: '010',
        note: '',
        rejected: 'rej-1',
      },
    });
    await fireEvent.press(screen.getByTestId('dismiss-rej-2'));
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM upload_rejections WHERE id = ?', [
      'rej-2',
    ]);
  });
});
