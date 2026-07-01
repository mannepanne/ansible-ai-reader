# Relay session trigger: queue consumer runs the session, app stays a pure producer

**Date:** 2026-07-01
**Status:** Accepted

## Context

Stage 1's Relay loop could be reviewed/approved from the admin tab, but *starting* a session
still required the `relay:session` CLI. A session runs autonomously in Anthropic's Managed-Agents
cloud and takes minutes; we poll it to completion, then finalize a backend-observed verdict via the
bridge. A Next.js request on Cloudflare can't hold open for minutes, which is why triggering was
deferred.

The unblocking fact: **Cloudflare queue consumers get up to 15 minutes of wall-clock per invocation**,
and the 30s/5min cap is *CPU* time — our poll is almost entirely `await`ing the Anthropic API and
sleeping, so CPU stays negligible. A queue consumer *can* hold a session open to completion.

## Decision

- The admin **"Run a session"** control POSTs a `reader_id` to an admin-gated route
  (`/api/admin/relay/run`) that enqueues one message on a dedicated **`ansible-relay-queue`**. The
  app is a **pure producer** — it never calls the Managed-Agents API ("mind" stays out of the
  user-facing worker).
- A dedicated **`ansible-relay-session-consumer`** worker runs the whole session per message: create
  session → send stimulus → poll to `idle` → finalize the verdict through the bridge `/decision`.
  Resource creation is NOT done here (the environment/vault/agent already exist; the consumer only
  runs sessions against their IDs, passed as `[vars]`).
- Queue config is load-bearing for correctness:
  - **`max_concurrency = 1`** — sessions must not overlap. `finalizeDecision` attributes "this
    session's piece" as the newest `pending_review` piece created at/after `T0`; concurrent runs
    would overlap their `T0` windows and cross-attribute pieces. Serial execution preserves the
    invariant. (`max_batch_size = 1` too — one stimulus per invocation.)
  - **`max_retries = 0`** — a retry would re-run create-session (not idempotent) → a duplicate agent
    session + a second in-window piece → the same cross-attribution, self-inflicted. A dead run
    stops (dead-letters) and gets re-triggered manually.
- **`T0` is stamped inside the consumer**, immediately before create-session — never at enqueue
  (a message may wait behind another run, which would make the backward-30s window wrong).
- Failures leave a **`sync_log` breadcrumb** (`sync_type = 'relay_session_failed'`, `user_id` null),
  mirroring the summary consumer — so a run that dies before a verdict is diagnosable, not invisible.

## Alternatives considered

- **Run the poll in the app route / a cron→app route.** Puts the minutes-long poll (and the "mind")
  in the user-facing app worker, and a request can't hold that long anyway. Cron-finalize would work
  but needs a faster cron + an in-flight table + splits the run across app and cron. More parts, and
  "mind" leaks into the app.
- **Self-re-enqueuing poller** (consumer re-enqueues itself every ~15s to poll). Robust to duration
  limits, but the 15-min consumer ceiling makes it unnecessary, and it fights the queue's
  retry-count/DLQ semantics. Rejected as over-engineering for a manual, serial, low-volume flow.
- **All-in-one but concurrent (default queue).** The trap: consumers autoscale concurrency by
  default, which silently breaks verdict attribution under the exact load this feature enables (the
  9-stimulus run). Hence `max_concurrency = 1` as an explicit correctness setting, not a default.

## Consequences

- **Trade-off — serial throughput.** One session at a time; nine queued stimuli run back-to-back
  (~an hour). Fine for a manual art project; it's also what keeps attribution correct.
- **"Minimal status" (chosen scope):** the tab confirms "queued" and the verdict appears in the
  Decision log when the run finishes; a run that dies leaves a `sync_log` breadcrumb. A live
  `relay_runs` status table was deliberately deferred.
- **"Mind" now runs in a backend consumer** (holds `ANTHROPIC_API_KEY` + the resource IDs), never
  in the app. The bridge remains the sole `relay_*` writer; the consumer finalizes through it.
- **New provisioning:** the `ansible-relay-queue` + `ansible-relay-dlq` queues, and the consumer's
  secrets (`ANTHROPIC_API_KEY`, `RELAY_CONTROL_TOKEN`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`)
  wired into the worker and CI. `ANTHROPIC_API_KEY` is a new GitHub CI secret.
- The trigger works **in production only** — the `RELAY_QUEUE` binding doesn't exist under local
  `next dev`, so the route returns 503 there (matching the existing queue routes).
