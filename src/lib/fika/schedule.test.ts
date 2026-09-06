// @vitest-environment node
// ABOUT: Tests for Fika scheduling helpers
// ABOUT: Local parts across zones and DST, calendar arithmetic, and the send predicate

import { describe, it, expect } from 'vitest';
import {
  localParts,
  addDays,
  daysBetween,
  weekStart,
  shouldSend,
  isValidTimeZone,
  SEND_WINDOW_HOURS,
  MAX_SEND_ATTEMPTS,
} from './schedule';

describe('localParts', () => {
  it('resolves hour, date and weekday in the given zone', () => {
    // 2026-09-06 is a Sunday. 06:30Z is 07:30 in London (BST), 08:30 in Stockholm.
    const t = new Date('2026-09-06T06:30:00Z');
    expect(localParts(t, 'Europe/London')).toEqual({ hour: 7, date: '2026-09-06', weekday: 7 });
    expect(localParts(t, 'Europe/Stockholm')).toEqual({ hour: 8, date: '2026-09-06', weekday: 7 });
    expect(localParts(t, 'UTC')).toEqual({ hour: 6, date: '2026-09-06', weekday: 7 });
  });

  it('crosses the date line correctly for a user near midnight', () => {
    // 23:30 in London on the 6th is 00:30 on the 7th in Stockholm
    const t = new Date('2026-09-06T22:30:00Z');
    expect(localParts(t, 'Europe/London').date).toBe('2026-09-06');
    expect(localParts(t, 'Europe/Stockholm').date).toBe('2026-09-07');
    expect(localParts(t, 'Europe/Stockholm').weekday).toBe(1); // Monday
  });

  it('reports midnight as hour 0, never 24', () => {
    expect(localParts(new Date('2026-09-06T23:00:00Z'), 'Europe/London').hour).toBe(0);
  });

  it('follows DST: the spring-forward day has no 01:xx in London', () => {
    // 2026-03-29 clocks go 01:00 -> 02:00 BST. 01:30Z is 02:30 BST.
    expect(localParts(new Date('2026-03-29T01:30:00Z'), 'Europe/London').hour).toBe(2);
    // Before the switch, 00:30Z is 00:30 GMT
    expect(localParts(new Date('2026-03-29T00:30:00Z'), 'Europe/London').hour).toBe(0);
  });
});

describe('calendar arithmetic', () => {
  it('adds and subtracts days across month and year ends', () => {
    expect(addDays('2026-09-06', 1)).toBe('2026-09-07');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-06')).toBe(5);
    expect(daysBetween('2026-09-06', '2026-09-01')).toBe(-5);
    expect(daysBetween('2026-09-06', '2026-09-06')).toBe(0);
  });

  it('finds the Monday of the week', () => {
    expect(weekStart('2026-09-06', 7)).toBe('2026-08-31'); // Sunday -> previous Monday
    expect(weekStart('2026-08-31', 1)).toBe('2026-08-31'); // Monday -> itself
    expect(weekStart('2026-09-03', 4)).toBe('2026-08-31'); // Thursday
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('shouldSend', () => {
  const tz = 'Europe/London';
  // 07:00 London on 2026-09-06 (BST) = 06:00Z
  const at = (hourLondon: number) => new Date(Date.UTC(2026, 8, 6, hourLondon - 1, 5, 0));

  it('is off when fika_hour is null', () => {
    expect(shouldSend({ now: at(7), timeZone: tz, fikaHour: null, todaysBatch: null })).toMatchObject({
      send: false,
      reason: 'fika_off',
    });
  });

  it('waits before the hour and sends at the hour', () => {
    expect(shouldSend({ now: at(6), timeZone: tz, fikaHour: 7, todaysBatch: null })).toMatchObject({
      send: false,
      reason: 'before_window',
    });
    expect(shouldSend({ now: at(7), timeZone: tz, fikaHour: 7, todaysBatch: null })).toEqual({
      send: true,
      localDate: '2026-09-06',
    });
  });

  it('keeps sending inside the window and stops after it', () => {
    expect(shouldSend({ now: at(7 + SEND_WINDOW_HOURS - 1), timeZone: tz, fikaHour: 7, todaysBatch: null }).send).toBe(true);
    expect(shouldSend({ now: at(7 + SEND_WINDOW_HOURS), timeZone: tz, fikaHour: 7, todaysBatch: null })).toMatchObject({
      send: false,
      reason: 'after_window',
    });
  });

  it('does not resend a sent batch, retries an unsent one, and gives up after the attempt cap', () => {
    const base = { now: at(8), timeZone: tz, fikaHour: 7 };
    expect(shouldSend({ ...base, todaysBatch: { sentAt: '2026-09-06T06:01:00Z', sendAttempts: 1 } })).toMatchObject({
      send: false,
      reason: 'already_sent',
    });
    expect(shouldSend({ ...base, todaysBatch: { sentAt: null, sendAttempts: 1 } }).send).toBe(true);
    expect(shouldSend({ ...base, todaysBatch: { sentAt: null, sendAttempts: MAX_SEND_ATTEMPTS } })).toMatchObject({
      send: false,
      reason: 'attempts_exhausted',
    });
  });

  it('handles a late-evening fika_hour without wrapping past midnight', () => {
    // fika_hour 23, checked at 23:05 London -> send; at 00:05 next day -> before_window (new day)
    expect(shouldSend({ now: at(23), timeZone: tz, fikaHour: 23, todaysBatch: null }).send).toBe(true);
    const nextDay = new Date(Date.UTC(2026, 8, 6, 23, 5, 0)); // 00:05 London on the 7th
    const d = shouldSend({ now: nextDay, timeZone: tz, fikaHour: 23, todaysBatch: null });
    expect(d).toMatchObject({ send: false, reason: 'before_window', localDate: '2026-09-07' });
  });

  it('uses the local date for the batch key', () => {
    // 23:30 London = 00:30 Stockholm next day
    const t = new Date('2026-09-06T22:30:00Z');
    expect(shouldSend({ now: t, timeZone: 'Europe/Stockholm', fikaHour: 0, todaysBatch: null })).toEqual({
      send: true,
      localDate: '2026-09-07',
    });
  });
});
