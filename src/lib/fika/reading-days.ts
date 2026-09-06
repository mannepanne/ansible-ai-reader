// ABOUT: Derives the weekly reading-day dots from engagement events
// ABOUT: A reading day is any local calendar day with at least one user archive, rating, or click-through

import { localParts, weekStart, addDays, daysBetween } from './schedule';

export interface ReadingEvent {
  /** ISO timestamp of the archive, rating, or click-through */
  at: string;
}

export interface WeekSummary {
  /** Monday..Sunday */
  days: boolean[];
  count: number;
  target: number;
  /** YYYY-MM-DD of this week's Monday in the user's zone */
  weekStart: string;
}

export function readingDays(input: {
  events: ReadingEvent[];
  timeZone: string;
  now: Date;
  target: number;
}): WeekSummary {
  const today = localParts(input.now, input.timeZone);
  const monday = weekStart(today.date, today.weekday);
  const days = [false, false, false, false, false, false, false];

  for (const event of input.events) {
    const at = new Date(event.at);
    if (Number.isNaN(at.getTime())) continue;
    const local = localParts(at, input.timeZone).date;
    const offset = daysBetween(monday, local);
    if (offset >= 0 && offset < 7) days[offset] = true;
  }

  return {
    days,
    count: days.filter(Boolean).length,
    target: input.target,
    weekStart: monday,
  };
}

/** The earliest instant that could fall in the current local week; use as a query lower bound */
export function weekLowerBound(now: Date, timeZone: string): string {
  const today = localParts(now, timeZone);
  const monday = weekStart(today.date, today.weekday);
  // One day of slack absorbs any zone offset; the derivation filters precisely.
  return `${addDays(monday, -1)}T00:00:00.000Z`;
}
