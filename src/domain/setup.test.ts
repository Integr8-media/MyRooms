import { setupProgress, starterTypes, type StarterGroup } from './setup';
import { quickSetupSchema, validate } from './validation';

const ps: StarterGroup = {
  kind: 'ps_room',
  typeName: 'PlayStation room',
  stationPrefix: 'Room',
  count: 3,
  pricePerHour: 6000,
  maxPlayers: 4,
  color: '#2563eb',
};
const pc: StarterGroup = { ...ps, kind: 'pc_desk', typeName: 'PC', stationPrefix: 'PC', count: 0 };

describe('starterTypes', () => {
  it('makes one type per group with numbered stations', () => {
    expect(starterTypes([ps, { ...pc, count: 2, pricePerHour: 2000, maxPlayers: 1 }])).toEqual([
      {
        kind: 'ps_room',
        name: 'PlayStation room',
        color: '#2563eb',
        maxPlayers: 4,
        pricePerHour: 6000,
        stationNames: ['Room 1', 'Room 2', 'Room 3'],
      },
      {
        kind: 'pc_desk',
        name: 'PC',
        color: '#2563eb',
        maxPlayers: 1,
        pricePerHour: 2000,
        stationNames: ['PC 1', 'PC 2'],
      },
    ]);
  });

  it('skips groups with no stations', () => {
    expect(starterTypes([ps, pc]).map((t) => t.kind)).toEqual(['ps_room']);
  });
});

describe('setupProgress', () => {
  it('counts what is left', () => {
    expect(setupProgress({ pricedTypes: 0, stations: 0, staff: 0 }).remaining).toBe(3);
    const p = setupProgress({ pricedTypes: 2, stations: 8, staff: 0 });
    expect(p.done).toEqual({ prices: true, stations: true, staff: false });
    expect(p.remaining).toBe(1);
  });
});

describe('quickSetupSchema', () => {
  const values = { psCount: '4', psPrice: '60', psPlayers: '4', pcCount: '10', pcPrice: '20.5' };

  it('parses counts, prices in piasters and players (Arabic digits too)', () => {
    expect(validate(quickSetupSchema, { ...values, psCount: '٤' }).data).toEqual({
      psCount: 4,
      psPrice: 6000,
      psPlayers: 4,
      pcCount: 10,
      pcPrice: 2050,
    });
  });

  it('ignores the price of a group with no stations', () => {
    const r = validate(quickSetupSchema, { ...values, pcCount: '0', pcPrice: '' });
    expect(r.ok).toBe(true);
    expect(r.data?.pcPrice).toBe(0);
  });

  it('needs a price above zero for a group with stations', () => {
    expect(validate(quickSetupSchema, { ...values, psPrice: '' }).errors).toEqual({
      psPrice: 'required',
    });
    expect(validate(quickSetupSchema, { ...values, pcPrice: '0' }).errors).toEqual({
      pcPrice: 'outOfRange',
    });
  });

  it('needs at least one station', () => {
    expect(validate(quickSetupSchema, { ...values, psCount: '0', pcCount: '0' }).errors).toEqual({
      psCount: 'addStations',
    });
  });

  it('limits the number of stations', () => {
    expect(validate(quickSetupSchema, { ...values, pcCount: '500' }).errors.pcCount).toBe(
      'outOfRange',
    );
  });
});
