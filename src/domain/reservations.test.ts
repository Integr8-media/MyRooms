import {
  addDays,
  bookingFromRow,
  canCheckIn,
  canMarkNoShow,
  dayWindow,
  dragRange,
  findConflict,
  hourMarks,
  isReservedSoon,
  nextReservation,
  offsetInDay,
  openSessionOn,
  overlappingIds,
  rangeToForm,
  reservationRange,
  reservationState,
  runsIntoReservation,
  slotAt,
  todayKey,
  weekDates,
  type Booking,
} from './reservations';

const TZ = 'Africa/Cairo';
const MIN = 60_000;
// Monday 5 Jan 2026, 14:00 in Cairo (UTC+2).
const T = Date.UTC(2026, 0, 5, 12, 0);
const at = (minutes: number) => T + minutes * MIN;

const reserved = (id: string, stationId: string, from: number, to: number): Booking => ({
  id,
  stationId,
  reservation: true,
  status: 'reserved',
  start: at(from),
  end: at(to),
});

describe('bookingFromRow', () => {
  const row = {
    id: 'r',
    station_id: 's1',
    kind: 'reservation',
    scheduled_start: '2026-01-05 16:00:00+00',
    scheduled_end: '2026-01-05T17:00:00.000Z',
    actual_start: null,
    actual_end: null,
  };

  it('uses the booked slot for reservations and no-shows (both timestamp formats)', () => {
    expect(bookingFromRow({ ...row, status: 'reserved' })).toEqual({
      id: 'r',
      stationId: 's1',
      reservation: true,
      status: 'reserved',
      start: Date.UTC(2026, 0, 5, 16),
      end: Date.UTC(2026, 0, 5, 17),
    });
    expect(bookingFromRow({ ...row, status: 'no_show' })?.status).toBe('no_show');
  });

  it('uses the played time once a session started', () => {
    const active = bookingFromRow({
      ...row,
      kind: 'open',
      status: 'active',
      actual_start: '2026-01-05T15:50:00Z',
      scheduled_end: null,
    });
    expect(active).toMatchObject({ reservation: false, start: Date.UTC(2026, 0, 5, 15, 50) });
    expect(active?.end).toBeNull();
    const done = bookingFromRow({
      ...row,
      status: 'completed',
      actual_start: '2026-01-05T15:50:00Z',
      actual_end: '2026-01-05T17:10:00Z',
    });
    expect(done).toMatchObject({
      start: Date.UTC(2026, 0, 5, 15, 50),
      end: Date.UTC(2026, 0, 5, 17, 10),
    });
  });

  it('skips cancelled and unreadable rows', () => {
    expect(bookingFromRow({ ...row, status: 'cancelled' })).toBeNull();
    expect(bookingFromRow({ ...row, status: 'reserved', scheduled_end: 'soon' })).toBeNull();
    expect(bookingFromRow({ ...row, status: 'reserved', station_id: null })).toBeNull();
  });
});

describe('findConflict', () => {
  const bookings: Booking[] = [
    reserved('a', 's1', 60, 120),
    // A fixed walk-in planned until +30.
    { id: 'w', stationId: 's2', reservation: false, status: 'active', start: at(-30), end: at(30) },
    // An open walk-in.
    { id: 'o', stationId: 's3', reservation: false, status: 'active', start: at(-30), end: null },
    { ...reserved('gone', 's1', 0, 60), status: 'no_show' },
  ];

  it('finds an overlapping reservation on the same station', () => {
    expect(findConflict(bookings, { stationId: 's1', start: at(90), end: at(150) })?.id).toBe('a');
    expect(findConflict(bookings, { stationId: 's1', start: at(30), end: at(61) })?.id).toBe('a');
  });

  it('allows back-to-back bookings, other stations and the booking itself', () => {
    expect(findConflict(bookings, { stationId: 's1', start: at(120), end: at(180) })).toBeNull();
    expect(findConflict(bookings, { stationId: 's1', start: at(0), end: at(60) })).toBeNull();
    expect(findConflict(bookings, { stationId: 's4', start: at(60), end: at(120) })).toBeNull();
    expect(
      findConflict(bookings, { id: 'a', stationId: 's1', start: at(75), end: at(135) }),
    ).toBeNull();
  });

  it('is blocked by a walk-in planned to still be playing, not by an open one', () => {
    expect(findConflict(bookings, { stationId: 's2', start: at(15), end: at(75) })?.id).toBe('w');
    expect(findConflict(bookings, { stationId: 's2', start: at(30), end: at(90) })).toBeNull();
    expect(findConflict(bookings, { stationId: 's3', start: at(15), end: at(75) })).toBeNull();
    expect(openSessionOn(bookings, 's3')?.id).toBe('o');
    expect(openSessionOn(bookings, 's2')).toBeNull();
  });
});

describe('overlappingIds', () => {
  it('flags bookings two devices made offline for the same time', () => {
    const ids = overlappingIds(
      [
        reserved('a', 's1', 60, 120),
        reserved('b', 's1', 90, 150),
        reserved('c', 's1', 150, 180),
        reserved('d', 's2', 60, 120),
        { ...reserved('e', 's2', 60, 120), status: 'completed' },
      ],
      T,
    );
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('draws an open session up to now', () => {
    const open: Booking = { ...reserved('o', 's1', -60, 0), status: 'active', end: null };
    expect(overlappingIds([open, reserved('r', 's1', 30, 60)], at(45)).size).toBe(2);
    expect(overlappingIds([open, reserved('r', 's1', 30, 60)], at(10)).size).toBe(0);
  });
});

describe('reservation life', () => {
  const start = at(60);
  const end = at(120);

  it('goes upcoming → soon (30 min before) → due (15 min grace) → late → over', () => {
    expect(reservationState(start, end, at(29))).toBe('upcoming');
    expect(reservationState(start, end, at(30))).toBe('soon');
    expect(reservationState(start, end, at(60))).toBe('due');
    expect(reservationState(start, end, at(74))).toBe('due');
    expect(reservationState(start, end, at(75))).toBe('late');
    expect(reservationState(start, end, at(120))).toBe('over');
  });

  it('allows a no-show only after the grace period, and check-in until the end', () => {
    expect(canMarkNoShow(start, at(74))).toBe(false);
    expect(canMarkNoShow(start, at(75))).toBe(true);
    expect(canCheckIn(end, at(0))).toBe(true);
    expect(canCheckIn(end, at(120))).toBe(false);
  });

  it('picks the next reservation of a station, late ones included', () => {
    const list = [
      reserved('later', 's1', 180, 240),
      reserved('late', 's1', -20, 40),
      reserved('past', 's1', -120, -60),
      reserved('other', 's2', 10, 70),
    ];
    expect(nextReservation(list, 's1', T)?.id).toBe('late');
    expect(nextReservation(list, 's1', at(40))?.id).toBe('later');
    expect(nextReservation(list, 's3', T)).toBeNull();
  });

  it('shows "reserved soon" 30 minutes ahead and warns walk-ins that would run into it', () => {
    expect(isReservedSoon({ start: at(31) }, T)).toBe(false);
    expect(isReservedSoon({ start: at(30) }, T)).toBe(true);
    expect(isReservedSoon(null, T)).toBe(false);
    expect(runsIntoReservation(at(60), { start: at(90) }, T)).toBe(false);
    expect(runsIntoReservation(at(91), { start: at(90) }, T)).toBe(true);
    expect(runsIntoReservation(null, { start: at(90) }, T)).toBe(false);
    expect(runsIntoReservation(null, { start: at(20) }, T)).toBe(true);
    expect(runsIntoReservation(at(500), null, T)).toBe(false);
  });
});

describe('calendar days', () => {
  it('covers a normal local day', () => {
    const w = dayWindow('2026-01-05', TZ);
    expect(w.start).toBe(Date.UTC(2026, 0, 4, 22));
    expect(w.minutes).toBe(1440);
    const marks = hourMarks(w, TZ);
    expect(marks).toHaveLength(24);
    expect(marks[0]).toEqual({ offset: 0, hour: 0 });
    expect(marks[23]).toEqual({ offset: 1380, hour: 23 });
  });

  it("handles Cairo's 23-hour spring day (clocks jump at midnight)", () => {
    // 2026-04-24: 00:00 doesn't exist, the day starts at 01:00 (UTC+3).
    const w = dayWindow('2026-04-24', TZ);
    expect(w.minutes).toBe(1380);
    const marks = hourMarks(w, TZ);
    expect(marks).toHaveLength(23);
    expect(marks[0]!.hour).toBe(1);
  });

  it('steps dates and weeks', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(todayKey(Date.UTC(2026, 0, 5, 22, 30), TZ)).toBe('2026-01-06');
    // Monday 5 Jan with weeks starting Saturday → Sat 3 .. Fri 9.
    expect(weekDates('2026-01-05', 6)).toEqual([
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ]);
    expect(weekDates('2026-01-03', 6)[0]).toBe('2026-01-03');
  });

  it('finds the slot under a tap and positions in the day', () => {
    const w = dayWindow('2026-01-05', TZ);
    expect(slotAt(w, 14 * 60 + 7)).toBe(Date.UTC(2026, 0, 5, 12, 0));
    expect(slotAt(w, 14 * 60 + 15)).toBe(Date.UTC(2026, 0, 5, 12, 15));
    expect(slotAt(w, -10)).toBe(w.start);
    expect(slotAt(w, 5000)).toBe(w.end - 15 * MIN);
    expect(offsetInDay(Date.UTC(2026, 0, 5, 12, 30), w)).toBe(870);
    expect(offsetInDay(w.start - MIN, w)).toBe(0);
    expect(offsetInDay(w.end + MIN, w)).toBe(1440);
  });
});

describe('dragRange', () => {
  const range = { start: at(60), end: at(120) };

  it('moves both ends, snapped to 15 minutes', () => {
    expect(dragRange(range, 37, 'move')).toEqual({ start: at(90), end: at(150) });
    expect(dragRange(range, -52, 'move')).toEqual({ start: at(15), end: at(75) });
    expect(dragRange(range, 7, 'move')).toEqual(range);
  });

  it('resizes the end, keeping 15 minutes to 24 hours', () => {
    expect(dragRange(range, 30, 'resize')).toEqual({ start: at(60), end: at(150) });
    expect(dragRange(range, -500, 'resize')).toEqual({ start: at(60), end: at(75) });
    expect(dragRange(range, 5000, 'resize')).toEqual({ start: at(60), end: at(60 + 1440) });
  });
});

describe('form values', () => {
  it('turns a local date, time and length into instants and back', () => {
    const r = reservationRange('2026-01-05', 18 * 60, 90, TZ);
    expect(r).toEqual({ start: Date.UTC(2026, 0, 5, 16), end: Date.UTC(2026, 0, 5, 17, 30) });
    expect(rangeToForm(r.start, r.end, TZ)).toEqual({
      date: '2026-01-05',
      time: '18:00',
      minutes: 90,
    });
  });

  it('runs across a DST change by elapsed time', () => {
    // 23:30 on 23 Apr + 60 min: clocks jump from 00:00 to 01:00, so it ends at 01:30.
    const r = reservationRange('2026-04-23', 23 * 60 + 30, 60, TZ);
    expect(rangeToForm(r.end, r.end, TZ).time).toBe('01:30');
  });
});
