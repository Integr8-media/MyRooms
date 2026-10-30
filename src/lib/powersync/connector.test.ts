import { UpdateType } from '@powersync/common';

import { rejectionError, SupabaseConnector } from './connector';

const mockUpsert = jest.fn();
// The real package is ESM-only; the connector only needs the op names.
jest.mock('@powersync/common', () => ({
  UpdateType: { PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DELETE' },
}));
jest.mock('@/lib/config', () => ({ config: { powersyncUrl: 'https://sync.test' } }));
const mockReportError = jest.fn();
const mockReportWarning = jest.fn();
jest.mock('@/lib/monitoring', () => ({
  reportError: (...a: unknown[]) => mockReportError(...a),
  reportWarning: (...a: unknown[]) => mockReportWarning(...a),
}));
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }) }),
}));

describe('rejectionError', () => {
  it('names why the server refused a change', () => {
    expect(rejectionError('sessions', { code: '23514', message: 'too_early' })).toBe('too_early');
    // The exclusion constraint has no key of its own, only the code.
    expect(rejectionError('sessions', { code: '23P01', message: 'conflicting key value' })).toBe(
      'booking_conflict',
    );
    // Two devices started the same station: the one-active-session unique index.
    expect(rejectionError('sessions', { code: '23505', message: 'duplicate key' })).toBe(
      'station_busy',
    );
    expect(rejectionError('payments', { code: '42501', message: 'denied' })).toBe('not_allowed');
    expect(rejectionError('bills', { code: '23505' })).toBe('unknown');
  });
});

describe('SupabaseConnector.uploadData', () => {
  it('drops a refused write so the queue moves on, and records it for the "not saved" list', async () => {
    const op = {
      op: UpdateType.PUT,
      table: 'sessions',
      id: 'res-1',
      opData: { kind: 'reservation', station_id: 's1' },
    };
    const complete = jest.fn();
    const execute = jest.fn();
    const db = {
      getNextCrudTransaction: async () => ({ crud: [op], complete }),
      execute,
      getOptional: jest.fn(),
    };
    mockUpsert.mockResolvedValue({ error: { code: '23P01', message: 'conflict' } });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await new SupabaseConnector().uploadData(db as never);

    expect(complete).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO upload_rejections'), [
      'sessions',
      'PUT',
      'res-1',
      JSON.stringify(op.opData),
      'booking_conflict',
      expect.any(String),
    ]);
    // Reported without the row (it holds customer names and phones).
    expect(mockReportWarning).toHaveBeenCalledWith('Upload refused by the server', {
      area: 'sync.rejected',
      table: 'sessions',
      op: 'PUT',
      code: '23P01',
      key: 'booking_conflict',
    });
  });

  it('keeps a write that failed for a temporary reason, to retry later', async () => {
    const complete = jest.fn();
    const db = {
      getNextCrudTransaction: async () => ({
        crud: [{ op: UpdateType.PUT, table: 'sessions', id: 'x', opData: {} }],
        complete,
      }),
      execute: jest.fn(),
    };
    mockUpsert.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    await expect(new SupabaseConnector().uploadData(db as never)).rejects.toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    // Being offline is normal: not reported.
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('reports a server failure that keeps the queue waiting, at most every 10 minutes', async () => {
    const db = {
      getNextCrudTransaction: async () => ({
        crud: [{ op: UpdateType.PATCH, table: 'stations', id: 'x', opData: {} }],
        complete: jest.fn(),
      }),
      execute: jest.fn(),
    };
    const table = {
      update: () => ({ eq: async () => ({ error: { code: '57014', message: 'timeout' } }) }),
    };
    const client = jest.requireMock('@/lib/supabase/client') as { getSupabase: () => unknown };
    const original = client.getSupabase;
    client.getSupabase = () => ({ from: () => table });
    try {
      const connector = new SupabaseConnector();
      await expect(connector.uploadData(db as never)).rejects.toBeTruthy();
      await expect(connector.uploadData(db as never)).rejects.toBeTruthy();
    } finally {
      client.getSupabase = original;
    }
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError).toHaveBeenCalledWith(expect.objectContaining({ code: '57014' }), {
      area: 'sync.upload',
      table: 'stations',
      op: 'PATCH',
    });
  });
});
