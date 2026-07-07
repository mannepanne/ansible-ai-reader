# Relay session orchestration: a Durable Object, and its ledger sits outside the bridge

**Date:** 2026-07-07
**Status:** Accepted

## Decision

Run Relay sessions from a single-threaded **`RelayOrchestrator` Durable Object** (serial + alarm-driven),
and keep its run ledger (`agent_session_runs`) **outside** the bridge — written directly by the DO via the
service role, not through the "bridge = sole `relay_*` writer" seam.

## Context

Managed-Agent sessions take ~5 min and the duration is variable; Cloudflare hard-cancels a queue-consumer
invocation around ~4 min, so the single-invocation poll (PR #119/#120) orphaned pieces (diagnosed via the
instrumentation in #120 — the piece was written ~1.5 min *after* the consumer let go). Verdict attribution is
time-window-based (`finalizeDecision`: newest `pending_review` piece ≥ T0), and the bridge is **structurally
blind** to which run a `write_pending` belongs to (the MCP `tools/call` carries no session id), so the piece
cannot be stamped. Therefore attribution must stay window-based, which requires **serial** sessions.

## Alternatives considered

- **Re-enqueue poll (queue):** reuses the queue plumbing but hand-rolls the one-in-flight lock + lost-poll
  recovery — the bug surface (the advisor found a subtle lock hole pre-build). Re-enqueue churn.
- **Cron-sweep:** simplest logic (one sweep at a time = free lock) but a new cron path + latency.
- **Chosen — Durable Object:** single-threaded ⇒ serialization is *structural* (no lock table, no race);
  durable alarms ⇒ polling without a held invocation, no churn, no wedge. The one downside (new infra) is
  neutralised by the maintainer's prior DO experience.

## The seam deviation (why the ledger is not behind the bridge)

The prior decision was "the bridge is the sole writer of `relay_*` (owned memory)." The run ledger is **not
owned memory** — it's *mind-specific orchestration* (session_id, polling state). When the mind is swapped in
Stage 2 (Cloudflare Agents SDK), the ledger's shape changes *with the orchestrator*, so it belongs with the
orchestrator, not behind the memory seam. It is therefore:
- written directly by the DO (like `processing_jobs` / `sync_log`), and
- named **`agent_session_runs`** — deliberately *out* of the `relay_*` bucket so it does not read as a fourth
  owned-memory table.

The bridge remains the sole writer of the actual owned memory (`relay_pieces` / `relay_references` /
`relay_decisions`) — the DO still finalizes verdicts **through** the bridge `/decision`.

## Correctness note (carried by the same change)

Serialising sessions is not sufficient: T0 (`create − 30s`) reaches into the *previous* run's tail, so a
declining run could scoop the prior run's still-pending piece. `finalizeDecision` now **excludes pieces
already claimed by a prior decision**, which the serial ordering makes airtight and which also makes finalize
idempotent (needed for alarm retries).

## Consequences

- The queue consumer (#119/#120) is **superseded as the polling engine** and retired; its testable core
  (`runSession`/`readSession`/`finalizeDecision`), the trigger UI, and the diagnostics carry over.
- Deploy coupling: the app's DO binding (`script_name`) means the **orchestrator must deploy before the app**.
- New provisioning: the `agent_session_runs` migration; the orchestrator worker's secrets (manual, persist).
- Enables a future tab **run-status view** over `agent_session_runs` and a `relay:reconcile` sweep.
