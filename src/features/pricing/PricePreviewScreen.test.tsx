import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatMoney } from '@/domain/money';

import { PricePreviewScreen } from './PricePreviewScreen';

const TYPE = { id: 'ps5', name: 'PS5 Room', kind: 'ps_room', max_players: 4, is_active: 1 };
const RULES = [
  // Base 50 EGP/h, peak 18:00-24:00 at 80 EGP/h.
  {
    id: 'base',
    station_type_id: 'ps5',
    name: 'Base',
    price_per_hour: 5000,
    days_of_week: 127,
    priority: 0,
  },
  {
    id: 'peak',
    station_type_id: 'ps5',
    name: 'Peak',
    price_per_hour: 8000,
    days_of_week: 127,
    from_minute: 1080,
    to_minute: 1440,
    priority: 10,
  },
];
const PACKAGES = [
  { id: 'p3', station_type_id: 'ps5', name: '3 hours', minutes: 180, price: 15000 },
];

jest.mock('@powersync/react', () => ({
  useQuery: (sql: string) => ({
    data: sql.includes('FROM station_types')
      ? [TYPE]
      : sql.includes('FROM rate_rules')
        ? RULES
        : sql.includes('FROM packages')
          ? PACKAGES
          : [],
  }),
}));
jest.mock('@/features/workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({ org: { id: 'org', timezone: 'Africa/Cairo' }, can: () => true }),
}));
jest.mock('expo-router', () => ({ router: { canGoBack: () => false } }));

const money = (piasters: number) => formatMoney(piasters, 'en');

async function enter(start: [string, string], end: [string, string]) {
  await fireEvent.changeText(screen.getByTestId('preview-start-date'), start[0]);
  await fireEvent.changeText(screen.getByTestId('preview-start-time'), start[1]);
  await fireEvent.changeText(screen.getByTestId('preview-end-date'), end[0]);
  await fireEvent.changeText(screen.getByTestId('preview-end-time'), end[1]);
}

describe('PricePreviewScreen', () => {
  it('matches a hand-calculated price across the peak boundary', async () => {
    await render(<PricePreviewScreen />);
    // 17:00-18:00 base 50 + 18:00-19:30 peak 1.5 × 80 = 170 EGP
    await enter(['2026-01-05', '17:00'], ['2026-01-05', '19:30']);
    expect(screen.getByTestId('preview-total')).toHaveTextContent(money(17000));
    expect(screen.getByText('Peak')).toBeTruthy();
  });

  it('applies a package and charges the overtime', async () => {
    await render(<PricePreviewScreen />);
    // 14:00-18:30 with "3 hours" (150): covers 14-17, then 17-18 base 50 + 18-18:30 peak 40
    await enter(['2026-01-05', '14:00'], ['2026-01-05', '18:30']);
    await fireEvent.press(screen.getByText('3 hours'));
    expect(screen.getByTestId('preview-total')).toHaveTextContent(money(24000));
    expect(screen.getByText('Included in package')).toBeTruthy();
  });

  it('crosses midnight using the end date', async () => {
    await render(<PricePreviewScreen />);
    // 23:00-01:00: 1h peak 80 + 1h base 50
    await enter(['2026-01-05', '23:00'], ['2026-01-06', '01:00']);
    expect(screen.getByTestId('preview-total')).toHaveTextContent(money(13000));
  });

  it('explains invalid input instead of pricing it', async () => {
    await render(<PricePreviewScreen />);
    await enter(['2026-01-05', '20:00'], ['2026-01-05', '19:00']);
    expect(screen.queryByTestId('preview-bill')).toBeNull();
    expect(screen.getByText('The end must be after the start.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('preview-start-time'), '25:00');
    expect(screen.getByText('Enter a time like 18:00 (24-hour clock).')).toBeTruthy();
  });
});
