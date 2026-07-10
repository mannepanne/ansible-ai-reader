// ABOUT: Relay session orchestrator core — the alarm-driven serial state machine (exactly one session in
// ABOUT: flight), with injected effects so it is unit-testable. workers/relay-orchestrator.ts wraps it as a
// ABOUT: Durable Object (single-threaded = serialization for free; alarms = polling without a held invocation).

import {
  createSession,
  getSessionStatus,
  getSessionEvents,
  formatStimulus,
  type MaClient,
  type RunResourceIds,
} from './session-run';
import { readSession, type SessionSource } from './session-readout';

export interface CurrentRun {
  runId: string; // agent_session_runs row id
  readerId: string;
  sessionId: string;
  startedAt: string; // T0 (ISO)
  attempt: number;
}

// DO-storage-shaped persistence (an in-memory fake stands in for tests).
export interface RunStore {
  getQueue(): Promise<string[]>;
  setQueue(q: string[]): Promise<void>;
  getCurrent(): Promise<CurrentRun | null>;
  setCurrent(c: CurrentRun | null): Promise<void>;
  setAlarm(atMs: number): Promise<void>;
}

// Finalize one run's verdict (calls the bridge /decision → verdict + real piece_id). Injected so the
// owned-memory write stays behind the bridge and the core stays pure.
export type FinalizeFn = (args: {
  stimulusRef: string[];
  startedAt: string;
  reason: string | null;
  degraded: string | null;
  sources: SessionSource[];
}) => Promise<{ verdict: string; piece_id: string | null }>;

export interface OrchestratorDeps {
  store: RunStore;
  ma: MaClient;
  // untyped service-role client (matches consumer.ts / the app's service-role usage)
  supabase: any;
  finalize: FinalizeFn;
  ids: RunResourceIds;
  now: () => number;
  log: (m: string) => void;
  pollIntervalMs?: number; // default 15s
  maxAttempts?: number; // default 60 (~15 min at 15s)
}

const POLL_MS = 15_000;
const MAX_ATTEMPTS = 60;
const STALE_MS = 15 * 60_000; // an in-flight run older than this is treated as dead (lost alarm) and released

async function insertRun(deps: OrchestratorDeps, readerId: string, sessionId: string, startedAt: string): Promise<string> {
  const { data } = await deps.supabase
    .from('agent_session_runs')
    .insert({ reader_id: readerId, session_id: sessionId, started_at: startedAt, state: 'running', attempt: 0 })
    .select('id')
    .single();
  return data.id as string;
}

async function updateRun(deps: OrchestratorDeps, runId: string, patch: Record<string, unknown>): Promise<void> {
  await deps.supabase
    .from('agent_session_runs')
    .update({ ...patch, updated_at: new Date(deps.now()).toISOString() })
    .eq('id', runId);
}

/** Enqueue a reader_id and kick the machine if it's idle. */
export async function enqueue(deps: OrchestratorDeps, readerId: string): Promise<void> {
  const q = await deps.store.getQueue();
  q.push(readerId);
  await deps.store.setQueue(q);
  deps.log(`enqueued ${readerId} (queue=${q.length})`);

  // Stale-run recovery: an in-flight run with no advancing alarm (a lost alarm) would wedge the queue.
  // A trigger self-heals it — release a run older than STALE_MS so the machine can move on.
  const cur = await deps.store.getCurrent();
  if (cur && deps.now() - Date.parse(cur.startedAt) > STALE_MS) {
    deps.log(`releasing stale run ${cur.readerId} (age ${deps.now() - Date.parse(cur.startedAt)}ms)`);
    await updateRun(deps, cur.runId, { state: 'failed', error: 'stale — released' });
    await deps.store.setCurrent(null);
  }

  if (!(await deps.store.getCurrent())) {
    await startNext(deps);
  }
}

async function startNext(deps: OrchestratorDeps): Promise<void> {
  if (await deps.store.getCurrent()) return; // busy — serial invariant
  const q = await deps.store.getQueue();
  const readerId = q.shift();
  if (!readerId) {
    deps.log('idle — queue empty');
    return;
  }
  await deps.store.setQueue(q);
  try {
    const { data: row, error } = await deps.supabase
      .from('reader_items')
      .select('title, short_summary, commentariat_summary, tags, document_note, reader_note')
      .eq('reader_id', readerId)
      .maybeSingle();
    if (error) throw new Error(`stimulus fetch: ${error.message}`);
    if (!row) throw new Error(`no reader_item with reader_id ${readerId}`);

    const stimulus = formatStimulus(row);
    // T0 stamped at create; the DO is single-threaded so this window never overlaps another run's.
    const startedAt = new Date(deps.now() - 30_000).toISOString();
    const sessionId = await createSession(deps.ma, deps.ids, stimulus, readerId);
    const runId = await insertRun(deps, readerId, sessionId, startedAt);
    await deps.store.setCurrent({ runId, readerId, sessionId, startedAt, attempt: 0 });
    await deps.store.setAlarm(deps.now() + (deps.pollIntervalMs ?? POLL_MS));
    deps.log(`started ${readerId} session=${sessionId} run=${runId}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.log(`start failed ${readerId}: ${msg}`);
    await deps.supabase.from('agent_session_runs').insert({ reader_id: readerId, state: 'failed', error: msg }).select('id').single();
    await startNext(deps); // skip to the next queued run
  }
}

/** The alarm handler — poll the current run once, then advance the machine. */
export async function onAlarm(deps: OrchestratorDeps): Promise<void> {
  const current = await deps.store.getCurrent();
  if (!current) return;
  const interval = deps.pollIntervalMs ?? POLL_MS;
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;

  const reschedule = async (): Promise<void> => {
    const attempt = current.attempt + 1;
    if (attempt >= maxAttempts) {
      await updateRun(deps, current.runId, { state: 'failed', error: `poll cap (${maxAttempts}) reached` });
      await deps.store.setCurrent(null);
      await startNext(deps);
    } else {
      await deps.store.setCurrent({ ...current, attempt });
      await deps.store.setAlarm(deps.now() + interval);
    }
  };

  try {
    const status = await getSessionStatus(deps.ma, current.sessionId);
    if (status === 'idle') {
      // Idempotency: if this run was already finalized (an alarm that finished then the DO evicted before
      // clearing `current`), don't re-finalize — the ledger already reflects the verdict.
      const { data: runRow } = await deps.supabase
        .from('agent_session_runs')
        .select('state')
        .eq('id', current.runId)
        .maybeSingle();
      if (runRow && runRow.state !== 'running') {
        await deps.store.setCurrent(null);
        await startNext(deps);
        return;
      }
      const events = await getSessionEvents(deps.ma, current.sessionId);
      const readout = readSession(events);
      const result = await deps.finalize({
        stimulusRef: [current.readerId],
        startedAt: current.startedAt,
        reason: readout.closingText,
        degraded: readout.degraded,
        sources: readout.sources,
      });
      await updateRun(deps, current.runId, { state: result.verdict, piece_id: result.piece_id, degraded: readout.degraded ?? null });
      deps.log(`finalized ${current.readerId} verdict=${result.verdict} piece=${result.piece_id ?? '—'}`);
      await deps.store.setCurrent(null);
      await startNext(deps);
    } else if (status === 'terminated') {
      await updateRun(deps, current.runId, { state: 'failed', error: 'session terminated' });
      await deps.store.setCurrent(null);
      await startNext(deps);
    } else {
      await reschedule();
    }
  } catch (e) {
    // Transient (status/finalize). Retry under the cap — finalize is idempotent (exclude-claimed-pieces +
    // the ledger-state check above), so a retry cannot double-claim a piece.
    deps.log(`alarm error ${current.readerId}: ${e instanceof Error ? e.message : String(e)}`);
    await reschedule();
  }
}
