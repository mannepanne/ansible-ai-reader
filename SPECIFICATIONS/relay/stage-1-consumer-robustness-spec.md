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

## Correctness fix (load-bearing, independent of the polling mechanism)

The lock serialises *sessions* but **not the T0 window's reach into the prior run's tail**. `T0_{N+1} =
create − 30s` reaches ~30s *before* run N finalized; run N's piece is written at `idle − δ` (δ = seconds
between `write_pending` and idle). Whenever **δ ≤ 30s AND run N+1 declines AND run N's piece is still
`pending_review`** (Magnus reviews asynchronously, so it usually is), run N+1's "newest pending piece ≥ T0"
picks up **run N's piece** → a *decline* is recorded as `wrote` with the wrong `piece_id`. Not exotic: pieces
are often written in the final seconds before idle, and declines-after-writes are exactly what a mature
restraint system produces.

**Fix:** `finalizeDecision` excludes pieces already claimed by a prior decision:

```sql
... AND id NOT IN (SELECT piece_id FROM relay_decisions WHERE piece_id IS NOT NULL)
```

The lock guarantees run N is finalized (its piece claimed) before N+1 starts, so N+1 can never take it —
robust regardless of margin or clock skew. This also makes `finalizeDecision` **idempotent** (a re-run can't
re-claim an already-claimed piece), which the recovery path below relies on. This guard is independent of
whichever polling mechanism we pick, and should land even if the rest is staged.

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

### 3. Liveness / recovery (first-class, not a footnote)

The lock's liveness rests on the `poll` message always getting processed. This intersects with `max_retries`:

- **The `max_retries=0` rationale does NOT apply to the poll phase.** It was chosen to prevent duplicate
  session *creation* — but `poll` creates nothing; it's a status check + (idempotent) finalize. A blanket
  no-retry makes a single lost/killed poll wedge the run in `polling` → the lock stalls *every* queued run
  until the stale-lock timeout. Since the queue can't set retries per-phase, **handle it in code**: the poll
  handler catches its own errors and **always re-enqueues-or-acks**, never dies.
- **Finalize idempotency is required** once poll can re-run: a poll that finalizes then dies before ack must
  not double-write the decision on retry. Two guards: (a) the *exclude-claimed-pieces* change above, and (b)
  the poll checks run `state` (skip if already finalized). Both explicit.
- **Stale-lock timeout:** a `polling` run whose `started_at` is older than ~15 min is treated as dead — the
  next `start` force-fails it and releases the lock.
- **Reconciliation:** because the ledger holds `session_id` + `started_at`, a stuck/orphaned run is
  re-finalizable later (a manual `relay:reconcile` command or a sweep) — the ledger, not the piece, is the link.

### Polling mechanism — an open decision (nothing here needs sub-cron latency)

Three viable shapes for "poll across short invocations":

- **Re-enqueue poll** (specced above): consumer self-produces poll messages. Near-real-time, keeps the mind in
  one worker — but that's aesthetic, and it costs a self-producer binding + **re-enqueue churn** (a batch of 8
  `start` messages busy-bouncing every ~20s for the whole ~5 min of run 1).
- **Cron-sweep** (likely simplest): the trigger just inserts a `queued` `relay_runs` row; a cron does serial
  start-and-poll — **one sweep at a time IS the lock, for free** (no self-producer binding, no re-enqueue
  churn). Cost: finalize latency = cron interval (fine for manual/low-volume), and relay logic lives in a
  cron path. Guard against overlapping sweeps.
- **Durable Object + alarms** (textbook fit): a DO is single-threaded (serialization for free — no lock table)
  and alarm-driven (no invocation held open, no re-enqueue churn). It's the Cloudflare-native primitive for
  exactly this. Cost: **new infra** to introduce for the first time.

**Leaning cron-sweep** for a manual, low-volume Stage 1 (simplest, natural serialization). Re-enqueue is
defensible; the DO is the "right" primitive but new infra — rejected for Stage 1 on that ground, revisit if
Relay's orchestration grows. **Decision needed before build.**

## Scope staging (two separable mechanisms)

- **Polling rework — UNAVOIDABLE.** Even a *single* 5-min session cannot finalize in one invocation, so this
  is not gold-plating; it's the core fix, needed regardless of batching.
- **Lock / serialization — only for the concurrent-trigger (batch) case.** After the acceptance run, Stage-1
  triggering is manual/one-at-a-time. So the lock could be deferred and concurrency gated more cheaply at the
  **trigger route** ("refuse to start if a run is in flight") — shipping the poll rework first. Keep the two
  separable so we can stage if the lock proves fiddly.

## Seam consideration (needs a ruling)

The run ledger is **mind-specific orchestration** (session_id, polling state), not the agent's owned memory
(pieces/references/decisions). When the mind is swapped in Stage 2 (Cloudflare Agents SDK), the ledger's shape
changes *with it* — so it belongs with the orchestrator, not behind the memory seam. The consumer writes it
directly via service-role, like `processing_jobs` / `sync_log`; the bridge stays the sole writer of *owned
memory*. **Affirmed** — but two riders because this deviates from the previously-reviewed "bridge = sole
`relay_*` writer" decision and we cannot re-run team review:
- **Document it loudly in an ADR** (not just here) so the deviation is a recorded decision, not a silent drift.
- **Name it out of the owned-memory bucket** — e.g. `agent_session_runs` (or similar) rather than `relay_runs`,
  so it doesn't read as a fourth owned-memory `relay_*` table.

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
