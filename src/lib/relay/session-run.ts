// ABOUT: Relay session-run core — create a Managed-Agent session on a stimulus and poll to completion
// ABOUT: The testable session core; the live orchestrator DO drives it via src/lib/relay/orchestrator.ts

import { readUsage, type MaEvent, type SessionUsage } from './session-readout';

// A Managed-Agents API client: (method, path, body?) → parsed JSON (or null for 202). Throws on non-ok.
export type MaClient = (method: string, path: string, body?: unknown) => Promise<any>;

export interface RunResourceIds {
  agentId: string;
  environmentId: string;
  vaultId: string;
}

export interface StimulusRow {
  title: string | null;
  short_summary: string | null;
  commentariat_summary: string | null;
  // Enrichment (Stage 2.3a): topical tags and Magnus's own note on the item. Both are content
  // signals (§D) — they sharpen the desk without revealing the human gate. Ratings are NOT here by
  // design: a verdict on the desk's output would bias the agent toward feeling commissioned.
  tags: string[] | null;
  document_note: string | null;
  // reader_note (Stage 2.3b, §C): a note authored on the Reader side, retained from the archive
  // response. Same category as document_note — Magnus's own thought — so it enriches the stimulus too.
  reader_note: string | null;
}

// 'full' = the Stage 2.3a enriched stimulus (＋tags＋note); 'lean' = the pre-2.3a shape (title +
// summary + counter-case only). The mode is the lever for the enrichment A/B ablation, and the same
// switch 2.3b uses if the verdict is "trigger on engagement, but write from a lean stimulus".
export type StimulusMode = 'full' | 'lean';

/**
 * Format a reader_items row into the stimulus text the agent sees: summary, plus (in 'full' mode)
 * topical tags and the operator's note, and the counter-case. The summary is the irreducible
 * stimulus — enforced explicitly (not via a part count) so no enrichment field can let a
 * summary-less item slip through and spend a session on nothing to react to (stage-2.3 spec §A/§C).
 */
export function formatStimulus(row: StimulusRow, mode: StimulusMode = 'full'): string {
  if (!row.short_summary?.trim()) throw new Error('stimulus: reader_item has no summary text');

  const parts: string[] = [];
  if (row.title) parts.push(`Title: ${row.title}`);
  parts.push(`Summary:\n${row.short_summary.trim()}`);
  if (mode === 'full') {
    const tags = (row.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
    // Both note sources are Magnus's own thought; merge them under one Note block (no duplicate label).
    // Dedup identical text: document_note is pushed Ansible→Reader, so it round-trips back as reader_note
    // — without the Set the narrator would see the same sentence twice.
    const notes = [...new Set([row.document_note, row.reader_note].map((n) => n?.trim()).filter(Boolean))];
    if (notes.length) parts.push(`Note:\n${notes.join('\n')}`);
  }
  if (row.commentariat_summary?.trim()) parts.push(`Counter-case:\n${row.commentariat_summary.trim()}`);
  return parts.join('\n\n');
}

// Granular Managed-Agent steps for alarm-driven polling: the orchestrator DO polls across alarms
// (src/lib/relay/orchestrator.ts composes these), not in a held loop.

/** Create a session against the existing resources and send the stimulus. Returns the session id. */
export async function createSession(ma: MaClient, ids: RunResourceIds, stimulus: string, readerId: string): Promise<string> {
  const session = await ma('POST', '/sessions', {
    agent: ids.agentId,
    environment_id: ids.environmentId,
    vault_ids: [ids.vaultId],
    title: `Relay — ${readerId}`,
  });
  const sid = session.id as string;
  await ma('POST', `/sessions/${sid}/events?beta=true`, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: `Today's desk:\n\n${stimulus}` }] }],
  });
  return sid;
}

/** One status poll. */
export async function getSessionStatus(ma: MaClient, sessionId: string): Promise<string | null> {
  return ((await ma('GET', `/sessions/${sessionId}`)).status ?? null) as string | null;
}

/** Read the transcript. */
export async function getSessionEvents(ma: MaClient, sessionId: string): Promise<MaEvent[]> {
  return ((await ma('GET', `/sessions/${sessionId}/events?beta=true`)).data ?? []) as MaEvent[];
}

/**
 * Read the session's server-computed token usage (the canonical per-session cost, cache breakdown
 * included). The session object carries a `.usage` total; readUsage normalizes it. Returns null when
 * usage is unavailable so the ledger records "not measured" rather than a zero.
 */
export async function getSessionUsage(ma: MaClient, sessionId: string): Promise<SessionUsage | null> {
  const session = await ma('GET', `/sessions/${sessionId}`);
  return readUsage(session?.usage);
}
