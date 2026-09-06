// ABOUT: Local-time calendar helpers and the Fika send predicate
// ABOUT: Everything timezone-aware lives here so the cron route stays a thin loop

export interface LocalParts {
  /** 0-23 in the given zone */
  hour: number;
  /** YYYY-MM-DD in the given zone */
  date: string;
  /** 1 = Monday ... 7 = Sunday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Hours after fika_hour during which a not-yet-sent batch may still go out */
export const SEND_WINDOW_HOURS = 6;
/** Resend attempts per batch before the day is abandoned */
export const MAX_SEND_ATTEMPTS = 3;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves an instant to local calendar parts. Uses formatToParts so DST is handled by ICU,
 * not by us. hourCycle h23 keeps midnight as "00", never "24".
 */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
  return {
    hour: Number(parts.hour),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Calendar arithmetic on YYYY-MM-DD strings, zone-free */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** The Monday on or before the given local date */
export function weekStart(date: string, weekday: number): string {
  return addDays(date, -(weekday - 1));
}

export interface TodaysBatch {
  sentAt: string | null;
  sendAttempts: number;
}

export type SendDecision =
  | { send: true; localDate: string }
  | {
      send: false;
      localDate: string;
      reason: 'fika_off' | 'before_window' | 'after_window' | 'already_sent' | 'attempts_exhausted';
    };

/**
 * Sends once per local day, any tick from fika_hour up to SEND_WINDOW_HOURS later, so a missed
 * tick, an overrunning sync, or a DST spring-forward still gets a Fika that day, while a long-dead
 * cron does not fire a morning email in the evening on recovery.
 */
export function shouldSend(input: {
  now: Date;
  timeZone: string;
  fikaHour: number | null;
  todaysBatch: TodaysBatch | null;
}): SendDecision {
  const { hour, date } = localParts(input.now, input.timeZone);
  if (input.fikaHour === null) return { send: false, localDate: date, reason: 'fika_off' };
  if (hour < input.fikaHour) return { send: false, localDate: date, reason: 'before_window' };
  if (hour - input.fikaHour >= SEND_WINDOW_HOURS) return { send: false, localDate: date, reason: 'after_window' };
  if (input.todaysBatch?.sentAt) return { send: false, localDate: date, reason: 'already_sent' };
  if ((input.todaysBatch?.sendAttempts ?? 0) >= MAX_SEND_ATTEMPTS) {
    return { send: false, localDate: date, reason: 'attempts_exhausted' };
  }
  return { send: true, localDate: date };
}
