import '@/lib/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DeleteAccountCard } from '@/features/account/DeleteAccountCard';
import { UpdateNotice } from '@/features/updates/UpdateNotice';
import { useSettingsStore } from '@/lib/settings/settings-store';

import { QuickSetupScreen } from './QuickSetupScreen';
import { SetupChecklist } from './SetupChecklist';

let mockRole: 'owner' | 'manager' | 'cashier' = 'owner';
let mockFacts = { pricedTypes: 0, stations: 0, staff: 0 };
let mockMembers: { org_id: string; user_id: string; role: string; org_name: string }[] = [];
let mockPending = 0;

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => {
    if (sql.includes('AS pricedTypes')) return { data: [mockFacts], isLoading: false };
    if (sql.includes('o.name AS org_name')) return { data: mockMembers, isLoading: false };
    if (sql.includes('ps_crud')) return { data: [{ count: mockPending }], isLoading: false };
    return { data: [], isLoading: false };
  },
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    org: { id: 'org', name: 'Arena' },
    branch: { id: 'A', name: 'Branch A' },
    userId: 'me',
    role: mockRole,
    can: (p: string) => mockRole === 'owner' || p !== 'prices.edit',
  }),
}));
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'me', email: 'me@test.local' } } }),
}));

const mockRunQuickSetup = jest.fn(async (..._args: unknown[]) => {});
jest.mock('./api', () => ({ runQuickSetup: (...args: unknown[]) => mockRunQuickSetup(...args) }));
const mockDeleteAccount = jest.fn(async () => {});
jest.mock('@/lib/auth/actions', () => ({ deleteAccount: () => mockDeleteAccount() }));
let mockUpdate: { version: string; notes: string | null; install: jest.Mock } | null = null;
jest.mock('@/lib/updates/updates', () => ({ checkForUpdate: async () => mockUpdate }));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    push: (...a: unknown[]) => mockPush(...a),
    canGoBack: () => false,
  },
}));

beforeEach(() => {
  mockRole = 'owner';
  mockFacts = { pricedTypes: 0, stations: 0, staff: 0 };
  mockMembers = [];
  mockPending = 0;
  mockUpdate = null;
  jest.clearAllMocks();
  useSettingsStore.setState({ setupHidden: [] });
});

describe('QuickSetupScreen', () => {
  it('creates the types, prices and stations the owner asked for', async () => {
    await render(<QuickSetupScreen />);
    for (let i = 0; i < 3; i++)
      await fireEvent.press(screen.getByTestId('setup-ps-count-increase'));
    await fireEvent.changeText(screen.getByTestId('setup-ps-price'), '60');
    for (let i = 0; i < 2; i++)
      await fireEvent.press(screen.getByTestId('setup-pc-count-increase'));
    await fireEvent.changeText(screen.getByTestId('setup-pc-price'), '20');

    expect(screen.getByTestId('setup-preview')).toHaveTextContent(/Room 1 – Room 3/);
    await fireEvent.press(screen.getByTestId('setup-create'));

    expect(mockRunQuickSetup).toHaveBeenCalledWith('org', 'A', [
      expect.objectContaining({
        kind: 'ps_room',
        pricePerHour: 6000,
        maxPlayers: 4,
        stationNames: ['Room 1', 'Room 2', 'Room 3'],
      }),
      expect.objectContaining({
        kind: 'pc_desk',
        pricePerHour: 2000,
        maxPlayers: 1,
        stationNames: ['PC 1', 'PC 2'],
      }),
    ]);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('asks for at least one station and a price', async () => {
    await render(<QuickSetupScreen />);
    await fireEvent.press(screen.getByTestId('setup-create'));
    expect(screen.getByText('Add at least one room or desk.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('setup-pc-count-increase'));
    await fireEvent.press(screen.getByTestId('setup-create'));
    expect(screen.getByText('Required.')).toBeTruthy();
    expect(mockRunQuickSetup).not.toHaveBeenCalled();
  });

  it('is for owners only', async () => {
    mockRole = 'manager';
    await render(<QuickSetupScreen />);
    expect(screen.getByText('Only owners can set up stations and prices.')).toBeTruthy();
    expect(screen.queryByTestId('setup-create')).toBeNull();
  });
});

describe('SetupChecklist', () => {
  it('shows what is left and offers quick setup to a new owner', async () => {
    await render(<SetupChecklist />);
    expect(screen.getByText('3 step(s) left before your staff can start.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-quick-setup'));
    expect(mockPush).toHaveBeenCalledWith('/setup');
  });

  it('ticks done steps and can be hidden', async () => {
    mockFacts = { pricedTypes: 1, stations: 6, staff: 0 };
    await render(<SetupChecklist />);
    expect(screen.getByTestId('setup-step-prices-done')).toBeTruthy();
    expect(screen.getByTestId('setup-step-staff')).toBeTruthy();
    expect(screen.queryByTestId('open-quick-setup')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-hide'));
    expect(useSettingsStore.getState().setupHidden).toEqual(['org']);
    expect(screen.queryByTestId('setup-checklist')).toBeNull();
  });

  it('is gone once everything is done, and for staff', async () => {
    mockFacts = { pricedTypes: 1, stations: 6, staff: 2 };
    await render(<SetupChecklist />);
    expect(screen.queryByTestId('setup-checklist')).toBeNull();

    mockFacts = { pricedTypes: 0, stations: 0, staff: 0 };
    mockRole = 'cashier';
    await render(<SetupChecklist />);
    expect(screen.queryByTestId('setup-checklist')).toBeNull();
  });
});

describe('DeleteAccountCard', () => {
  it('needs the confirmation word, then deletes', async () => {
    mockMembers = [{ org_id: 'solo', user_id: 'me', role: 'owner', org_name: 'Solo Arena' }];
    await render(<DeleteAccountCard />);
    await fireEvent.press(screen.getByTestId('delete-account'));
    expect(screen.getByTestId('delete-orgs')).toHaveTextContent(/Solo Arena/);

    await fireEvent.press(screen.getByTestId('delete-account-confirm'));
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('delete-confirm-word'), 'delete');
    await fireEvent.press(screen.getByTestId('delete-account-confirm'));
    expect(mockDeleteAccount).toHaveBeenCalled();
  });

  it('blocks the only owner of an organization with staff', async () => {
    mockMembers = [
      { org_id: 'arena', user_id: 'me', role: 'owner', org_name: 'Arena' },
      { org_id: 'arena', user_id: 'ca', role: 'cashier', org_name: 'Arena' },
    ];
    await render(<DeleteAccountCard />);
    await fireEvent.press(screen.getByTestId('delete-account'));
    expect(screen.getByTestId('delete-blocked')).toHaveTextContent(/only owner of Arena/);
    expect(screen.queryByTestId('delete-confirm-word')).toBeNull();
  });
});

describe('UpdateNotice', () => {
  it('shows nothing without an update', async () => {
    await render(<UpdateNotice />);
    await act(async () => {});
    expect(screen.queryByTestId('update-notice')).toBeNull();
  });

  it('offers to install a new version', async () => {
    mockUpdate = { version: '1.0.1', notes: null, install: jest.fn(async () => {}) };
    await render(<UpdateNotice />);
    await act(async () => {});
    expect(screen.getByText('Version 1.0.1 is available')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('update-install'));
    expect(mockUpdate.install).toHaveBeenCalled();
  });
});
