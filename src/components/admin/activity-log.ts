// ABOUT: Pure merge of the Relay activity log — session decisions + engagement-gate skips (2.3c).
// ABOUT: Newest-first with a stable tiebreak so an equal-timestamp pair never jitters across pages.

import type { RelayActivityRow } from './types';

/**
 * Merge session decisions and gate skips into one chronological activity log (newest first).
 *
 * The two sources have independent clocks — a decision's created_at vs a gate skip's relay_triggered_at —
 * so equal-millisecond timestamps are plausible in a burst. A stable secondary sort (kind, then id) keeps
 * the order deterministic across renders; without it, two rows sharing a timestamp could swap between
 * pages on re-fetch. Operates on a fresh array, so the inputs are not mutated.
 */
export function mergeActivity(
  decisions: RelayActivityRow[],
  skips: RelayActivityRow[],
): RelayActivityRow[] {
  return [...decisions, ...skips].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1; // newest first
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1; // tiebreak: kind…
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // …then id
  });
}
