// ABOUT: Relay session-run core — create a Managed-Agent session on a stimulus and poll to completion
// ABOUT: The testable orchestration; workers/relay-session-consumer.ts is the thin I/O glue around it

import type { MaEvent } from './session-readout';

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
}

export interface SessionRunResult {
  sessionId: string;
  status: string | null; // 'idle' | 'terminated' | last-polled status
  events: MaEvent[];
}

/**
 * Format a reader_items row into the stimulus text the agent sees (summary + counter-case). A bare
 * title is not a stimulus — throws so a session is never spent on an item with no summary to react to.
 */
export function formatStimulus(row: StimulusRow): string {
  const parts: string[] = [];
  if (row.title) parts.push(`Title: ${row.title}`);
  if (row.short_summary?.trim()) parts.push(`Summary:\n${row.short_summary.trim()}`);
  if (row.commentariat_summary?.trim()) parts.push(`Counter-case:\n${row.commentariat_summary.trim()}`);
  if (parts.length <= 1) throw new Error('stimulus: reader_item has no summary text');
  return parts.join('\n\n');
}

/**
 * Create one session against the already-created resources, send the stimulus, and poll until the
 * session is idle or terminated. Resource creation is NOT done here — the environment/vault/agent
 * exist already; this only runs a session and returns its transcript.
 *
 * Two independent poll bounds: `maxPolls` (iteration cap) and `budgetMs` (a WALL-CLOCK deadline). The
 * budget lets the caller exit cleanly *before* a platform invocation-duration limit hard-cancels the
 * Worker — turning a silent kill (lost decision + dead-letter) into a diagnosable "did not complete".
 * `opts.log` reports phase milestones with elapsed ms so the exact kill boundary is visible in logs.
 */
export async function runSession(
  ma: MaClient,
  ids: RunResourceIds,
  stimulus: string,
  opts: {
    readerId: string;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    maxPolls?: number;
    budgetMs?: number;
    log?: (msg: string) => void;
  },
): Promise<SessionRunResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const pollIntervalMs = opts.pollIntervalMs ?? 3000;
  const maxPolls = opts.maxPolls ?? 120;
  const budgetMs = opts.budgetMs ?? 210_000; // exit under the observed ~4-min cancel point
  const log = opts.log ?? (() => {});
  const start = now();

  const session = await ma('POST', '/sessions', {
    agent: ids.agentId,
    environment_id: ids.environmentId,
    vault_ids: [ids.vaultId],
    title: `Relay — ${opts.readerId}`,
  });
  const sid = session.id as string;
  log(`session ${sid} created`);

  await ma('POST', `/sessions/${sid}/events?beta=true`, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: `Today's desk:\n\n${stimulus}` }] }],
  });

  let status: string | null = null;
  let polls = 0;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollIntervalMs);
    polls++;
    status = (await ma('GET', `/sessions/${sid}`)).status;
    if (status === 'idle' || status === 'terminated') break;
    if (now() - start > budgetMs) {
      log(`poll budget ${budgetMs}ms exceeded at poll ${polls} (status ${status}) — exiting before cancel`);
      break;
    }
  }
  log(`poll exit: status=${status} polls=${polls} elapsed=${now() - start}ms`);

  const events = ((await ma('GET', `/sessions/${sid}/events?beta=true`)).data ?? []) as MaEvent[];
  return { sessionId: sid, status, events };
}
