import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/lib/i18n';
import { useSyncStore } from '@/lib/powersync/sync-store';

import { SyncBadge } from './SyncBadge';
import { SyncNotices } from './SyncNotices';
import { SyncScreen } from './SyncScreen';

type Status = {
  connected: boolean;
  connecting: boolean;
  lastSyncedAt?: Date;
  dataFlowStatus: {
    uploading: boolean;
    downloading: boolean;
    uploadError?: Error;
    downloadError?: Error;
  };
};

const MOCK_NOW = Date.UTC(2026, 0, 5, 12, 0);
let mockStatus: Status;
let mockPending = 0;
let mockHead: string | null = null;
let mockQueue: { table_name: string; count: number }[] = [];

jest.mock('@powersync/react', () => ({
  useStatus: () => mockStatus,
  useQuery: (sql: string) => {
    if (sql.includes('count(*) AS count FROM ps_crud')) return { data: [{ count: mockPending }] };
    if (sql.includes('SELECT data FROM ps_crud'))
      return { data: mockHead ? [{ data: mockHead }] : [] };
    if (sql.includes('GROUP BY table_name')) return { data: mockQueue };
    if (sql.includes('FROM session_segments) AS')) {
      return {
        data: [{ sessions: 1200, session_segments: 1500, payments: 900, session_items: 40 }],
      };
    }
    return { data: [] };
  },
}));
jest.mock('@/features/sessions/data', () => ({ useNow: () => MOCK_NOW }));
jest.mock('./RejectedChanges', () => ({ RejectedChanges: () => null }));
const mockSyncNow = jest.fn();
jest.mock('@/lib/powersync/control', () => ({ syncNow: () => mockSyncNow() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), canGoBack: () => false, back: jest.fn() },
}));

const online = (patch: Partial<Status['dataFlowStatus']> = {}): Status => ({
  connected: true,
  connecting: false,
  lastSyncedAt: new Date(MOCK_NOW - 3 * 60_000),
  dataFlowStatus: { uploading: false, downloading: false, ...patch },
});

beforeEach(() => {
  mockStatus = online();
  mockPending = 0;
  mockHead = null;
  mockQueue = [];
  useSyncStore.setState({
    clockSkewMs: null,
    clockCheckedAt: null,
    persistentStorage: null,
    retrying: false,
  });
  jest.clearAllMocks();
});

describe('SyncBadge', () => {
  it('shows the state and what is waiting, and opens the Sync page', async () => {
    mockStatus = { ...online(), connected: false };
    mockPending = 4;
    await render(<SyncBadge />);
    expect(screen.getByTestId('sync-state')).toHaveTextContent('Offline');
    expect(screen.getByTestId('sync-badge-pending')).toHaveTextContent('4 waiting');
    await fireEvent.press(screen.getByTestId('sync-badge'));
    expect(mockPush).toHaveBeenCalledWith('/sync');
  });

  it('says up to date with nothing waiting', async () => {
    await render(<SyncBadge />);
    expect(screen.getByTestId('sync-state')).toHaveTextContent('Up to date');
    expect(screen.queryByTestId('sync-badge-pending')).toBeNull();
  });
});

describe('SyncNotices', () => {
  it('shows nothing when all is well', async () => {
    await render(<SyncNotices />);
    expect(screen.queryByTestId('sync-notices')).toBeNull();
  });

  it('warns after an hour offline', async () => {
    mockStatus = {
      ...online(),
      connected: false,
      lastSyncedAt: new Date(MOCK_NOW - 2 * 3_600_000),
    };
    mockPending = 7;
    await render(<SyncNotices />);
    expect(screen.getByTestId('sync-notice-offline')).toHaveTextContent(
      /offline since .*7 changes waiting/,
    );
  });

  it('blames the bill function when a new bill heads a stuck queue', async () => {
    mockStatus = online({ uploadError: new Error('FunctionsFetchError') });
    mockPending = 3;
    mockHead = JSON.stringify({ op: 'PUT', type: 'bills', id: 'b1' });
    await render(<SyncNotices />);
    expect(screen.getByTestId('sync-notice-stuck')).toHaveTextContent(/create-bill/);
  });

  it('warns about a wrong clock', async () => {
    useSyncStore.setState({ clockSkewMs: 7 * 60_000 });
    await render(<SyncNotices />);
    expect(screen.getByTestId('sync-notice-clock')).toHaveTextContent(/7 min behind the server/);
  });
});

describe('SyncScreen', () => {
  it('lists waiting changes, device checks and data size, and syncs on demand', async () => {
    mockPending = 5;
    mockQueue = [
      { table_name: 'payments', count: 3 },
      { table_name: 'sessions', count: 2 },
    ];
    useSyncStore.setState({
      clockSkewMs: -30_000,
      clockCheckedAt: MOCK_NOW,
      persistentStorage: false,
    });
    await render(<SyncScreen />);

    expect(screen.getByTestId('sync-screen-state')).toHaveTextContent('Up to date');
    expect(screen.getByTestId('sync-last')).toHaveTextContent(/3 min ago/);
    expect(screen.getByTestId('sync-pending')).toHaveTextContent('5');
    expect(screen.getByTestId('sync-queue')).toHaveTextContent(/Payments and refunds.*3/);
    expect(screen.getByTestId('sync-clock')).toHaveTextContent('Correct');
    expect(screen.queryByTestId('sync-clock-wrong')).toBeNull();
    expect(screen.getByTestId('sync-storage')).toHaveTextContent('May be cleared by the browser');
    expect(screen.getByText('1,200')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sync-now'));
    expect(mockSyncNow).toHaveBeenCalled();
  });

  it('explains a stuck queue and a wrong clock', async () => {
    mockStatus = online({ uploadError: new Error('500') });
    mockPending = 2;
    mockHead = JSON.stringify({ op: 'PATCH', type: 'sessions', id: 's1' });
    useSyncStore.setState({ clockSkewMs: -5 * 60_000 });
    await render(<SyncScreen />);
    expect(screen.getByTestId('sync-screen-state')).toHaveTextContent('Not uploading');
    expect(screen.getByTestId('sync-stuck')).toHaveTextContent(/retried automatically/);
    expect(screen.getByTestId('sync-clock-wrong')).toHaveTextContent(/5 min ahead/);
  });
});
