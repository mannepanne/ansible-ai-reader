# ADR: Typed Supabase Client from Generated Schema Types

**Date:** 2026-09-07
**Status:** Active
**Supersedes:** N/A

---

## Decision

Every Supabase client in `src/`, `workers/`, and `scripts/` carries the `Database` generic from `src/types/database.types.ts`, a file generated from the live schema by `npm run db:types` (`supabase gen types typescript`). Functions that receive a client take `SupabaseClient<Database>`, never the bare `SupabaseClient`. Test doubles are the one exception (see trade-offs). The file is regenerated after every migration, in the same PR as the migration.

Row shapes come from the query, not from hand-written annotations: `type Row = NonNullable<typeof result.data>[number]` derives the type from the select string and cannot drift.

## Context

The first live Fika tick failed (PR #146) because `fika_batch_items` has two foreign keys to `fika_batches` and every `fika_batch_items(...)` embed was ambiguous. Mocked store tests asserted the select string we wrote, so they could not catch it; the read-only replay script `npm run fika:diagnose` was written afterwards to fill that gap. The open question was whether the compiler could have caught it.

A one-hour spike answered it. With the generated types threaded through the clients and the Fika store's parameter typed, removing the `!batch_id` hint produces this compile error:

> Could not embed because more than one relationship was found for 'fika_batch_items' and 'fika_batches' you need to hint the column with fika_batch_items!<columnName>

The same pass surfaced fourteen other errors, all real: columns the database allows to be null (`created_at` on older tables, `processing_jobs.reader_item_id`, `users.fika_hour`) that the code assumed were never null, and a `Json` column read as if it were always an object.

## Alternatives considered

- **Untyped client plus the real-schema replay only:** what we had. The replay catches embed and filter mistakes but only for the code paths a script exercises, and only when someone runs it.
  - Why not: it found the bug after the first production failure, not before merge.

- **Hand-written row types per query:** what the admin page did, with inline `(row: { id: string; created_at: string })` annotations.
  - Why not: they drift from the schema silently; three of the fourteen errors were exactly these annotations being wrong.

- **Generated types on every client (chosen):** the compiler checks table names, column names, nullability, insert and update shapes, and embed relationships against the schema.

## Reasoning

- The embed-ambiguity check alone would have prevented a production incident.
- Query results are typed from the select string, so hand-written row annotations go away and column renames show up as compile errors across the codebase.
- Cost was one hour of spike and fourteen small fixes, none of which changed behaviour on the wire.

## Trade-offs accepted

**The generated file is a snapshot.** Nothing in CI compares it with the live schema. The rule is procedural: `npm run db:types` after every migration, in the same PR. A stale file gives the same false confidence as no file. The migrations README carries the step.

**Nullable columns surface where the code never expected null.** Several older tables have `created_at` without `NOT NULL` even though the default is `now()`. The code narrows at the boundary (`?? ''`, a type-guard filter) rather than pretending. A migration that adds `NOT NULL` to those columns would remove the narrowing; it is a schema clean-up, not part of this decision.

**pgvector columns are typed as `string`.** The generator has no vector type. supabase-js serialises a `number[]` and PostgREST casts it, so nothing on the wire changes; `toVectorParam()` in `src/lib/relay/embed.ts` is the single place the gap is bridged. `Json` columns need `as Json` (or `as unknown as Json` for object types without an index signature).

**An untyped `SupabaseClient` parameter silently opts out.** A typed client is assignable to the bare type, so a module that declares `db: SupabaseClient` compiles and loses every check. New code takes `SupabaseClient<Database>`; the PR review checklist asks for it.

**Test doubles stay untyped.** Mocked clients are cast (`as never`) and route tests hand-roll query chains returning literal rows, so a schema change does not break a stale fixture. Typing a chainable query-builder mock is expensive and brittle. The precise answer to "would the compiler have caught PR #146?" is therefore: yes in production code, no in the fixtures.

**The real-schema replay is still required** for what types cannot see: filter values, RPC arguments, RLS behaviour, and whether a query returns the rows you meant. Types make the replay a check on semantics instead of syntax.

**No CI check on snapshot freshness, for now.** A step that regenerates the types and fails on a diff needs a Supabase access token in CI secrets, a standing credential added to catch a procedural slip. Revisit the first time a migration ships without a regenerated snapshot; until then `npm run db:types && git diff --exit-code src/types/database.types.ts` before opening a migration PR is the check.

## Implications

- `src/types/database.types.ts` (generated, committed) and `npm run db:types`
- `src/utils/supabase/*.ts`, `src/lib/supabase.ts`, and the three workers construct typed clients
- `src/app/api/cron/auto-sync/route.ts`, `src/hooks/useTracking.ts`, and the operator scripts in `scripts/` construct typed clients
- `src/lib/fika/*.ts`, `src/lib/sync-operations.ts`, `src/lib/archive.ts`, `src/lib/relay/{backfill,tools,engagement-trigger,decisions}.ts`, and `workers/consumer.ts` take `SupabaseClient<Database>`
- Nullable timestamps are dropped or shown as a placeholder at the boundary, never turned into an empty string that a date formatter would throw on
- Documented in `REFERENCE/architecture/database-schema.md` (Generated Types) and `supabase/migrations/README.md`

## References

- PR #146: the ambiguous-embed failure this decision responds to; `REFERENCE/features/fika.md` (troubleshooting)
- PR #157: adoption
- `REFERENCE/architecture/database-schema.md` (Generated Types), `supabase/migrations/README.md` (After Every Migration)
- `REFERENCE/development/pr-review-workflow.md` (review checklist), `REFERENCE/development/testing-strategy.md` (limit of mocking Supabase)
