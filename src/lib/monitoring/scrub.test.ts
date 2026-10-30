import { scrubBreadcrumb, scrubEvent, scrubText, scrubValue } from './scrub';

describe('scrubText', () => {
  it('removes emails, phones and tokens but keeps uuids', () => {
    const id = '30000000-0000-0000-0000-00000000000a';
    expect(
      scrubText(
        `owner@test.local called 01012345678 / +20 100 123 4567 about ${id} Bearer abc.def`,
      ),
    ).toBe(`[email] called [phone] / [phone] about ${id} Bearer [token]`);
    expect(scrubText('jwt eyJhbGciOi.eyJzdWIi.sig-123')).toBe('jwt [token]');
    expect(scrubText('رقم ٠١٠١٢٣٤٥٦٧٨')).toBe('رقم [phone]');
  });

  it('leaves short numbers and ordinary text alone', () => {
    expect(scrubText('Station 12 failed with code 23505 after 1500 ms')).toBe(
      'Station 12 failed with code 23505 after 1500 ms',
    );
  });
});

describe('scrubValue', () => {
  it('drops personal fields and scrubs nested strings', () => {
    expect(
      scrubValue({
        table: 'sessions',
        customer_name: 'Omar',
        row: { customer_phone: '0100', note: 'VIP', station_id: 's1' },
        list: ['a@b.co'],
      }),
    ).toEqual({
      table: 'sessions',
      customer_name: '[removed]',
      row: { customer_phone: '[removed]', note: '[removed]', station_id: 's1' },
      list: ['[email]'],
    });
  });
});

describe('scrubEvent', () => {
  it('keeps only the user id and drops the request', () => {
    const event = scrubEvent({
      message: 'failed for a@b.co',
      user: { id: 'u1', email: 'a@b.co', ip_address: '1.2.3.4' },
      request: { headers: { Authorization: 'Bearer x' } },
      extra: { email: 'a@b.co', code: '23505' },
      exception: { values: [{ value: 'duplicate 01012345678' }] },
      breadcrumbs: [{ message: 'GET a@b.co', data: { phone: '1' } }],
    });
    expect(event).toEqual({
      message: 'failed for [email]',
      user: { id: 'u1' },
      request: undefined,
      extra: { email: '[removed]', code: '23505' },
      contexts: undefined,
      exception: { values: [{ value: 'duplicate [phone]' }] },
      breadcrumbs: [{ message: 'GET [email]', data: { phone: '[removed]' } }],
    });
  });

  it('scrubs breadcrumbs on their own', () => {
    expect(scrubBreadcrumb({ message: 'x@y.com', category: 'fetch' })).toEqual({
      message: '[email]',
      category: 'fetch',
      data: undefined,
    });
  });
});
