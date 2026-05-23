# ADR: New Operation = New Job Type (Queue Dispatch Pattern)

**Date:** 2026-05-09
**Status:** Active
**Supersedes:** N/A

---

## Decision

When a queue-processed operation has a meaningfully different lifecycle from existing operations — different inputs, different external dependencies, different cost profile, different failure semantics — it gets a **new `job_type` enum value**, a **new branch in the consumer's dispatch switch**, and a **dedicated path through the existing job lifecycle scaffolding** (status transitions, retry counters, sync_log entries, DLQ behaviour). Routing happens at *enqueue* time; the consumer dispatches on `jobType` and runs operation-specific logic.

This decision is the resolution of TD-002 (the "Regenerate Tags" button silently re-running summary generation), and is intended to apply to every future operation that lands on `PROCESSING_QUEUE`.

## Context

TD-002 was a wasteful-execution bug: clicking "Regenerate Tags" enqueued a `summary_generation` job, which the consumer treated identically to a fresh sync — re-fetching the article from Reader, re-running a 1500-token Perplexity summary call, then writing both `short_summary` and `tags` back. The user wanted tags only; they got a slower, more expensive, and (sometimes) lower-quality summary as a side-effect.

The fix is mechanically simple but the surrounding shape is not: the project will keep growing operations that share the queue (commentariat regeneration, future tag curation, possibly bulk re-summarisation after prompt changes). The decision was less "how do we fix this one?" and more "what dispatch shape do we want every future operation to fit into?"

## Alternatives considered

- **One `summary_generation` job type with a smart worker (state-driven dispatch).** Keep a single enum value; the consumer reads the row's current state (`short_summary IS NULL` → full summary, otherwise → tags only) and decides what to do. Rejected — the routing decision lives at the *click site* (which button did the user press?), not the row state. Encoding the user's intent into a row-state inference is brittle (a row with `short_summary IS NOT NULL` could legitimately need a re-summary after prompt change). It also conflates "what the user asked for" with "what the data happens to look like right now."

- **Separate endpoint with its own synchronous path (no queue at all).** `regenerate-tags` calls Perplexity directly in the request handler, no queue dispatch. Rejected — Perplexity calls are 2–5 seconds and the regenerate operation often hits multiple items; running synchronously inside a Cloudflare Worker request blows past sensible response times and gives up retry/DLQ for free. The queue infrastructure exists; using it is the right default.

- **Chosen: new `job_type` enum value + new consumer branch.** Routing decision lives at enqueue time (the API route knows what the user clicked). The consumer's dispatch switch reads `jobType` and runs the operation-specific path. Job lifecycle (status transitions, attempts, sync_log) is shared scaffolding; only the *work* is operation-specific.

## Reasoning

**Routing decision belongs at enqueue time, not in the consumer.**
The API route that handles "Regenerate Tags" knows exactly what the user wants — it shouldn't have to encode that intent into a row state for the consumer to re-derive. Stamping `job_type: 'tags_generation'` at enqueue is one line; teaching the consumer to infer intent from row state is N lines and N edge cases.

**Lifecycle scaffolding stays shared.**
A new job type does *not* mean a new queue, a new retry mechanism, a new sync_log shape, or a new DLQ. The `processing_jobs` table, the attempts/max_attempts counter, the `sync_type` column on `sync_log`, and the `message.ack()` / `message.retry()` semantics are all reused. Only the work inside the dispatch branch is operation-specific. This keeps the lifecycle one shape; the surface that grows is the dispatch switch and the per-operation work, not the infrastructure around them.

**The fan-out is small and explicit.**
Adding `tags_generation` required: one Postgres `ALTER TYPE … ADD VALUE` migration, one new branch in the consumer, one new value in the Zod enum on the jobs API route, and one type-union widening on the queue message. Each touchpoint is a place where TypeScript / Zod / Postgres will fail loudly if you miss it. The "one thing the consumer dispatches on" is `jobType` — that's the only place an exhaustiveness check needs to live.

**Symmetry with how `sync_type` already worked.**
`sync_log.sync_type` was already a free-form string distinguishing operation flavours (`reader_sync`, `summary_generation`, `tags_generation_failed`, etc.). Adding a parallel enum on `processing_jobs.job_type` matches the existing mental model: every operation has a name; the name routes its lifecycle.

## Trade-offs accepted

**Postgres enum migrations are slightly awkward.**
`ALTER TYPE … ADD VALUE` cannot be referenced in the same transaction it was added in (Postgres limitation), so any new job type requires the migration to ship *before* the app code that emits the new value. This is documented inline in the migration file. The deploy ordering risk (migration must run before the worker auto-deploys on merge) is a real cost, called out in the PR test plan whenever a new job type lands.

**Dispatch switch will grow over time.**
With three job types the dispatch is a clean if/else, but `processJob` is already ~260 lines once both branches are inlined — large enough that the next job type is a sensible point to extract a per-job-type strategy table. We accept the linear growth so far and will extract on the next addition rather than carrying a fourth branch inline.

**Backward-compat fallback for in-flight messages.**
When a new job type ships, queue messages enqueued by the *previous* worker version don't have the new field. The consumer must default the field for in-flight messages (`?? 'summary_generation'`) for the deploy window. The default is dated and removed once the in-flight window has drained (Cloudflare Queues retention + max retries). This is a known piece of debt every new-job-type ADD takes on, and the dated comment is the contract that prevents it from going permanent.

**Each new job type widens four places, not one.**
Postgres enum, Zod enum on the API route, TypeScript queue-message type, consumer dispatch switch. We don't have a single source of truth that auto-propagates. The mitigation is that all four are required for the change to compile or run; the cost is ceremony rather than risk. Future generalisation (e.g. a code-generated enum) is possible but not justified at three job types.

## Implications

**Enables:**
- A clear contract for every future queue-dispatched operation: name it, enum it, branch it, reuse the lifecycle scaffolding.
- Per-operation cost monitoring via `sync_log.sync_type` without operation conflation.
- Per-operation failure handling (e.g. `tags_generation_failed` is filterable in alerts independently of `summary_generation_failed`).
- Future operations (commentariat regeneration, tag curation, batch re-summarisation) drop in by following the same shape.

**Prevents / complicates:**
- Coalescing two operations into one job type later is harder than splitting — the dispatch surface grows naturally but doesn't shrink. We accept this asymmetry; conflation is the bug we're trying to prevent.
- New ops that fit *cleanly* inside an existing job type (genuine variants of the same operation, not new operations) shouldn't get a new enum just for symmetry — the rule is "different lifecycle / different cost profile / different external deps," not "different button label."

**Maintenance guidance for future job types:**
1. Add the enum value via a migration with `ADD VALUE IF NOT EXISTS` (idempotent, replay-safe).
2. Widen the Zod enum on `src/app/api/jobs/route.ts` AND the TypeScript `QueueMessage.jobType` union in `workers/consumer.ts`.
3. Add the new branch in the consumer dispatch switch. Reuse `trackTokenUsage`, `PermanentError`, the `processing_jobs` status transitions, and the `sync_log` failure logging — do not re-implement lifecycle handling per operation.
4. If the new operation reads from an existing column instead of fetching externally (as `tags_generation` reads `short_summary`), guard against the row not having what you need with a `PermanentError` — don't silently no-op or write empty data.
5. Document the deploy-ordering requirement in the PR test plan: migration before worker deploy.
6. Add the dated backward-compat fallback for in-flight messages, and remove it after the queue retention window has elapsed.

---

## References

- Resolved technical debt: TD-002 (Wasteful Tag Regeneration — resolved May 2026)
- Migration: `supabase/migrations/20260509_add_tags_generation_job_type.sql`
- Consumer dispatch: `workers/consumer.ts` (`processJob` function)
- API enqueue site: `src/app/api/reader/regenerate-tags/route.ts`
- Feature documentation: [`REFERENCE/features/tags.md`](../features/tags.md#tag-regeneration)
