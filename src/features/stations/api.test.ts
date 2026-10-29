import { stationNames } from './api';

jest.mock('@/lib/powersync/database', () => ({ powersync: {} }));

describe('stationNames', () => {
  it('numbers stations added together', () => {
    expect(stationNames('PC', 3)).toEqual(['PC 1', 'PC 2', 'PC 3']);
    expect(stationNames('Room', 2, 5)).toEqual(['Room 5', 'Room 6']);
  });

  it('keeps the name as typed for a single station', () => {
    expect(stationNames('VIP 1', 1)).toEqual(['VIP 1']);
  });
});
