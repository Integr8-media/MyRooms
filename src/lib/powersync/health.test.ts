import {
  ageOf,
  clockSkew,
  isClockWrong,
  isLongOffline,
  LONG_OFFLINE_MS,
  parseQueuedChange,
  stuckReason,
  syncState,
  type SyncInput,
} from './health';

const base: SyncInput = {
  connected: true,
  connecting: false,
  uploading: false,
  downloading: false,
  pending: 0,
};

describe('syncState', () => {
  it('is ok when connected and idle', () => {
    expect(syncState(base)).toBe('ok');
  });

  it('is offline or connecting when not connected, whatever the errors', () => {
    expect(syncState({ ...base, connected: false, uploadError: new Error('x'), pending: 3 })).toBe(
      'offline',
    );
    expect(syncState({ ...base, connected: false, connecting: true })).toBe('connecting');
  });

  it('is stuck when uploads fail while changes wait', () => {
    expect(syncState({ ...base, uploadError: new Error('500'), pending: 2 })).toBe('stuck');
    // An old upload error with nothing left to send is not stuck.
    expect(syncState({ ...base, uploadError: new Error('500'), pending: 0 })).toBe('ok');
  });

  it('reports download errors, then activity', () => {
    expect(syncState({ ...base, downloadError: new Error('401') })).toBe('error');
    expect(syncState({ ...base, uploading: true })).toBe('syncing');
    expect(syncState({ ...base, downloading: true })).toBe('syncing');
  });
});

describe('isLongOffline', () => {
  const now = Date.UTC(2026, 0, 5, 12);
  it('needs to be offline and past the limit since the last sync', () => {
    expect(isLongOffline('offline', now - LONG_OFFLINE_MS, now)).toBe(true);
    expect(isLongOffline('connecting', now - LONG_OFFLINE_MS - 1, now)).toBe(true);
    expect(isLongOffline('offline', now - LONG_OFFLINE_MS + 1, now)).toBe(false);
    expect(isLongOffline('ok', now - 10 * LONG_OFFLINE_MS, now)).toBe(false);
    // Never synced (first start offline): the boot screen handles that.
    expect(isLongOffline('offline', null, now)).toBe(false);
  });
});

describe('ageOf', () => {
  it('rounds down to minutes, hours and days', () => {
    expect(ageOf(-5)).toEqual({ unit: 'now' });
    expect(ageOf(59_999)).toEqual({ unit: 'now' });
    expect(ageOf(60_000)).toEqual({ unit: 'minutes', count: 1 });
    expect(ageOf(59 * 60_000 + 59_999)).toEqual({ unit: 'minutes', count: 59 });
    expect(ageOf(3 * 3_600_000 + 1)).toEqual({ unit: 'hours', count: 3 });
    expect(ageOf(49 * 3_600_000)).toEqual({ unit: 'days', count: 2 });
  });
});

describe('queued changes', () => {
  it('parses ps_crud data', () => {
    expect(parseQueuedChange('{"op":"PUT","type":"bills","id":"b1","data":{}}')).toEqual({
      op: 'PUT',
      table: 'bills',
      id: 'b1',
    });
    expect(parseQueuedChange('not json')).toBeNull();
    expect(parseQueuedChange('{"op":"PUT"}')).toBeNull();
    expect(parseQueuedChange(null)).toBeNull();
  });

  it('blames the bill function only for a new bill at the head of the queue', () => {
    expect(stuckReason({ op: 'PUT', table: 'bills', id: 'b' })).toBe('bill_function');
    expect(stuckReason({ op: 'PATCH', table: 'bills', id: 'b' })).toBe('server');
    expect(stuckReason({ op: 'PUT', table: 'sessions', id: 's' })).toBe('server');
    expect(stuckReason(null)).toBe('server');
  });
});

describe('clock', () => {
  it('compares the server time with the middle of the round trip', () => {
    // Sent at 1000, answered at 1400: the server said 1200 → exactly right.
    expect(clockSkew(1000, 1400, 1200)).toBe(0);
    // Device is 5 minutes behind the server.
    expect(clockSkew(0, 200, 100 + 300_000)).toBe(300_000);
  });

  it('warns from two minutes either way', () => {
    expect(isClockWrong(119_999)).toBe(false);
    expect(isClockWrong(120_000)).toBe(true);
    expect(isClockWrong(-180_000)).toBe(true);
    expect(isClockWrong(null)).toBe(false);
  });
});
