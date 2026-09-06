// @vitest-environment node
// ABOUT: Tests for weekly reading-day derivation
// ABOUT: Local day bucketing, Monday reset, zone boundaries, bad input

import { describe, it, expect } from 'vitest';
import { readingDays, weekLowerBound } from './reading-days';

describe('readingDays', () => {
  // Sunday 2026-09-06 12:00 London
  const now = new Date('2026-09-06T11:00:00Z');

  it('marks the local days that had an event and counts them', () => {
    const result = readingDays({
      events: [
        { at: '2026-08-31T08:00:00Z' }, // Mon
        { at: '2026-08-31T18:00:00Z' }, // Mon again, still one day
        { at: '2026-09-02T08:00:00Z' }, // Wed
        { at: '2026-09-06T09:00:00Z' }, // Sun
      ],
      timeZone: 'Europe/London',
      now,
      target: 5,
    });
    expect(result.days).toEqual([true, false, true, false, false, false, true]);
    expect(result.count).toBe(3);
    expect(result.target).toBe(5);
    expect(result.weekStart).toBe('2026-08-31');
  });

  it('ignores events from last week and next week', () => {
    const result = readingDays({
      events: [{ at: '2026-08-30T12:00:00Z' }, { at: '2026-09-07T12:00:00Z' }],
      timeZone: 'Europe/London',
      now,
      target: 5,
    });
    expect(result.count).toBe(0);
  });

  it('buckets by the local day, not UTC', () => {
    // 23:30Z Sunday 6th is Monday 7th 01:30 in Stockholm -> next week, not counted
    const late = readingDays({
      events: [{ at: '2026-09-06T23:30:00Z' }],
      timeZone: 'Europe/Stockholm',
      now,
      target: 5,
    });
    expect(late.count).toBe(0);
    // The same instant in Los Angeles is Sunday 16:30 -> counted
    const la = readingDays({
      events: [{ at: '2026-09-06T23:30:00Z' }],
      timeZone: 'America/Los_Angeles',
      now,
      target: 5,
    });
    expect(la.days[6]).toBe(true);
  });

  it('resets on Monday: a Monday 00:05 local view shows only Monday', () => {
    const mondayEarly = new Date('2026-09-06T23:05:00Z'); // 00:05 Monday London
    const result = readingDays({
      events: [{ at: '2026-09-06T20:00:00Z' }, { at: '2026-09-06T23:04:00Z' }],
      timeZone: 'Europe/London',
      now: mondayEarly,
      target: 5,
    });
    expect(result.weekStart).toBe('2026-09-07');
    expect(result.days).toEqual([true, false, false, false, false, false, false]);
  });

  it('skips unparseable timestamps', () => {
    const result = readingDays({ events: [{ at: 'nope' }], timeZone: 'UTC', now, target: 3 });
    expect(result.count).toBe(0);
  });
});

describe('weekLowerBound', () => {
  it('returns an instant a day before the local Monday', () => {
    expect(weekLowerBound(new Date('2026-09-06T11:00:00Z'), 'Europe/London')).toBe('2026-08-30T00:00:00.000Z');
  });
});
