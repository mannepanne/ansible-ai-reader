# Relay Stage 1 — Session-consumer robustness (long sessions)

**Status:** DRAFT for review (2026-07-07)
**Fixes:** the "Canceled" invocation / lost-decision bug surfaced by the acceptance run (PR #120 instrumented it).

## Problem (from the diagnostic run)

Sessions take **~5 minutes** and the duration is **variable** — the same items that finished in ~3.5 min
during the acceptance run took ~5 min the next day. The consumer runs the whole poll in **one invocation**;
Cloudflare hard-**Cancels** a queue-consumer invocation around ~4 min, and the piece is written by the agent
*mid-session* (via `write_pending`), so the session keeps running on Anthropic's side after the consumer
lets go. Result: the piece lands **orphaned** (no `relay_decisions` row) and the message dead-letters.

Instrumented evidence (3/3 diagnostic runs): session created → still `running` at the 210 s budget → clean
breadcrumb, but the piece was written **~1.5 min after the consumer exited**. The single-invocation poll
model cannot hold a 5-min session, and no budget below the ~4-min cancel can catch one.

## The constraint that shapes the fix

`finalizeDecision` attributes "this session's piece" as *the newest `pending_review` piece created at/after
`T0`*. There is **no piece→run link** available: the MCP `tools/call` the bridge receives carries only
`{name, arguments}` — **no session id** — and the vault bearer token is shared across all sessions. The
bridge (the sole writer of the agent's owned memory) is **structurally blind** to which run a `write_pending`
belongs to. So the agent-written piece **cannot be stamped** with `reader_id`/`session_id` at write time.

**Therefore:** attribution must remain `T0`-window-based, which requires **serial sessions** (one in flight at
a time). The fix keeps sessions serial but polls each across **many short invocations**, and holds the
`reader_id ↔ session_id ↔ T0` link in a **run ledger on the trusted consumer side** (not on the piece).

## Design

### 1. `relay_runs` — the run ledger + serialization lock

New table (written by the **consumer**, service-role; **not** owned-memory, so not behind the bridge — see
"Seam" below):

| column | notes |
|---|---|
| `id` uuid pk | run id (the queue message payload) |
| `reader_id` text | the stimulus |
| `session_id` text null | the MA session (null until created) |
| `started_at` timestamptz null | **T0**, stamped at session-create (the window anchor) |
| `state` text | `queued` → `polling` → (`wrote` \| `declined` \| `failed`) |
| `piece_id` uuid null | set on finalize (traceability) |
| `attempt` int default 0 | poll attempt count |
| `degraded` text null, `error` text null | diagnostics |
| `created_at`, `updated_at` timestamptz | |

**The lock:** at most one row in `state='polling'`. `max_concurrency=1` already serialises *message*
processing, which makes the "is a run polling?" check-then-insert atomic — so the lock holds.

### 2. Re-enqueue poll (primary design)

The consumer becomes a **producer to its own queue** (self re-enqueue; add a producer binding). Two message
phases:

- **`{phase:'start', readerId}`** — if a run is already `polling`, **re-enqueue this start** with
  `delaySeconds` (wait for the lock). Else: create the MA session, insert a `relay_runs` row
  (`state='polling'`, `session_id`, `started_at = now − 30 s`), enqueue `{phase:'poll', runId}` with a short
  delay, ack. *(Short invocation — no long poll.)*
- **`{phase:'poll', runId}`** — load the run; GET session status:
  - `idle` → finalize via bridge `/decision` (unchanged `T0` logic), set run `state=verdict, piece_id`, ack. **Lock released.**
  - `running` → `attempt++`; if under the cap, re-enqueue `{phase:'poll', runId}` with delay; else mark `failed` + breadcrumb; ack.
  - `terminated` → mark `failed` + breadcrumb; ack.

Because only one run is ever `polling`, `T0` windows never overlap and attribution stays exact.

### 3. Liveness / recovery

- **Stale-lock timeout:** a `polling` run whose `started_at` is older than ~15 min is treated as dead — the
  next `start` force-fails it and releases the lock (prevents a lost poll message wedging the queue).
- **Reconciliation:** because the ledger holds `session_id` + `started_at`, a stuck/orphaned run is
  re-finalizable later (a manual `relay:reconcile` command or a sweep) — the ledger, not the piece, is the link.

### Alternative considered: cron-sweep
Consumer `start` (with the lock) creates the session + records the run + acks (trivial); a fast cron polls the
single `polling` run each tick and finalizes. Simpler consumer, reuses cron, no self-producer binding — but
finalize latency = cron interval, and it spreads relay logic into the cron/app worker (mind leaks out of the
dedicated consumer). **Recommend re-enqueue** to keep the mind in one worker and near-real-time; cron-sweep is
the fallback if the self-producer binding proves awkward.

## Seam consideration (needs a ruling)

`relay_runs` is **orchestration state**, not the agent's owned memory (pieces/references/decisions). The
consumer writes it directly via service-role, like `processing_jobs` / `sync_log` — the bridge stays the sole
writer of *owned memory*. This is a defensible reading of the "mind rented, memory owned" seam (the ledger is
operator bookkeeping), but it does put a `relay_*` table outside the bridge. **Open question for review:** is
that acceptable, or should run-ledger writes go through new bridge routes for strictness?

## Scope

**In:** `relay_runs` migration; consumer rework (start/poll phases + lock + ledger); self-producer binding;
stale-lock recovery; tests. Reconcile the **3 existing orphaned diagnostic pieces** + #9's orphan (manual, via
the ledger/T0).

**Deferred / adjacent (not this slice):** a tab **run-status view** over `relay_runs` (the "live status table"
deferred earlier — now justified); an automated reconciliation sweep (manual command is enough for Stage 1).

## Testing
- `relay_runs` lock: a second `start` while one is `polling` re-enqueues (does not create a 2nd session).
- Poll phases: `idle`→finalize+ledger update; `running`→re-enqueue+attempt++; cap→failed+breadcrumb; `terminated`→failed.
- Stale-lock: an old `polling` run is force-released by the next `start`.
- Attribution unchanged: `finalizeDecision` still `T0`-window (serial guaranteed by the lock).

## Open questions
1. Seam ruling on `relay_runs` (above).
2. Poll cadence + attempt cap (session ~5 min ⇒ e.g. 15 s delay × up to ~40 attempts = ~10 min ceiling).
3. Re-enqueue vs cron-sweep (recommend re-enqueue).
4. Worth stamping `session_id` on the run at create only (yes) — piece stays unstamped (bridge-blind).
