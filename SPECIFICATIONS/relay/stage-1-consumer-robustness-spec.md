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

**DECIDED (2026-07-07): a Durable Object** (`RelayOrchestrator`). Chosen over re-enqueue-poll (reuses more
queue plumbing but hand-rolls the lock + recovery — the bug surface) and cron-sweep (simplest logic but a new
cron path + latency). A DO makes the correctness-critical requirement — *exactly one session in flight +
reliable polling* — **structural** (single-threaded + durable alarms) rather than hand-rolled, and Magnus has
DO experience so the only real downside (new infra) is neutralised. The queue/consumer (#119/#120) is
superseded **as the polling engine**; its testable core (`runSession`/`readSession`/`finalizeDecision`),
trigger UI, and diagnostics carry over.

### 1. `RelayOrchestrator` — the Durable Object (serialization + polling engine)

- A **singleton** DO (`idFromName('relay')`) → single-threaded ⇒ **exactly one run in flight, structurally**
  (no lock table, no check-then-insert race, no `max_concurrency` reliance).
- The **trigger route** calls it via a DO binding (`RELAY_ORCHESTRATOR`, cross-worker via `script_name`):
  `stub.fetch(POST /enqueue {readerId})`. The DO appends to a pending-run queue in **DO storage**; if idle it
  begins the next run.
- **Begin a run:** create the MA session (reuse the create/send calls), write an `agent_session_runs` row
  (`state='running'`, `session_id`, `started_at = now − 30 s` = T0), set an **alarm** ~15 s out.
- **`alarm()`** — check the current run's session status:
  - `idle` → finalize via bridge `/decision` (`T0` + *exclude-claimed-pieces*), update the ledger row
    (`verdict`, `piece_id`) → dequeue and begin the next run (or go idle).
  - `running` → `attempt++`; under the cap → set the next alarm; over → mark `failed` + breadcrumb → next.
  - `terminated` → mark `failed` + breadcrumb → next.
- Reuses `formatStimulus`, the MA client, `readSession`, `finalizeDecision`. Alarm-driven polling replaces the
  6-min loop: each alarm does one short status check, so no invocation is ever held toward the cancel wall.

### 2. `agent_session_runs` — the run ledger (visibility + reconciliation, not a lock)

Written by the DO (service-role). **Not** a lock (the DO's single-threadedness is the serialization) and
**not** owned memory — it's mind-specific orchestration (session_id/polling), named out of the `relay_*`
bucket deliberately (see "Seam"). Columns: `id` uuid pk, `reader_id`, `session_id`, `started_at` (T0),
`state` (`running` → `wrote`|`declined`|`failed`), `piece_id`, `attempt`, `degraded`, `error`, timestamps.
Purpose: the tab's run-status view + reconciliation of a stuck/orphaned run (the ledger, not the piece, is the
`reader_id ↔ session_id ↔ T0` link).

### 3. Liveness / recovery (mostly free with the DO)

- **No wedge risk:** the DO alarm is durable — if the DO evicts or crashes mid-run, the alarm re-fires on next
  access and resumes. The lost-poll-wedges-the-lock failure mode of the queue design does not exist here.
- **Finalize idempotency still required:** an alarm that finalizes then evicts before persisting the dequeue
  could re-finalize. Guards: (a) *exclude-claimed-pieces* (above) and (b) the ledger `state` check (skip if
  already finalized). Both explicit.
- **Stale run:** a `running` row older than ~15 min → mark `failed` and move on (belt-and-braces).
- **Reconciliation:** `relay:reconcile` (manual) re-finalizes from the ledger's `session_id` + `started_at`.

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
