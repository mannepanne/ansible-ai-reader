// ABOUT: Pure argument parser for the relay:session CLI (scripts/relay-session.ts).
// ABOUT: Kept side-effect-free (no env/fs) so it is unit-testable apart from the script's I/O glue.

import type { StimulusMode } from './session-run';

/**
 * Parsed relay:session arguments. Discriminated on `pushOnly` so the type encodes the invariant
 * "a reader_id is required unless this is a voice-only push":
 * - `pushOnly: false` → `readerId` is a guaranteed string (a session will run against it).
 * - `pushOnly: true`  → `readerId` is optional and ignored (only the voice is pushed).
 */
export type SessionArgs =
  | { pushOnly: false; readerId: string; mode: StimulusMode; exemplarOverride?: number }
  | { pushOnly: true; readerId?: string; mode: StimulusMode; exemplarOverride?: number };

export type ParseResult = { ok: true; args: SessionArgs } | { ok: false; error: string };

const USAGE =
  'Usage: npx tsx scripts/relay-session.ts <reader_id> [--lean] [--exemplar <index>] [--push-only]';

/**
 * Parse `process.argv.slice(2)` into validated session options. Returns a discriminated result rather
 * than throwing/exiting, so the caller owns the process lifecycle and the parser stays testable.
 */
export function parseSessionArgs(argv: string[]): ParseResult {
  const pushOnly = argv.includes('--push-only');
  const mode: StimulusMode = argv.includes('--lean') ? 'lean' : 'full';

  const exIdx = argv.indexOf('--exemplar');
  const exemplarValue = exIdx >= 0 ? argv[exIdx + 1] : undefined;
  const exemplarOverride = exIdx >= 0 ? Number(exemplarValue) : undefined;
  if (exemplarOverride !== undefined && !Number.isFinite(exemplarOverride)) {
    return { ok: false, error: `--exemplar expects a number, got "${exemplarValue}"` };
  }

  // The first non-flag token that is not the --exemplar value is the reader_id.
  const readerId = argv.find((a) => !a.startsWith('--') && a !== exemplarValue);

  if (pushOnly) {
    // A voice-only push assembles + pushes the agent and exits; no stimulus, no session, no reader_id.
    return { ok: true, args: { pushOnly: true, readerId, mode, exemplarOverride } };
  }
  if (!readerId) {
    return { ok: false, error: USAGE };
  }
  return { ok: true, args: { pushOnly: false, readerId, mode, exemplarOverride } };
}
