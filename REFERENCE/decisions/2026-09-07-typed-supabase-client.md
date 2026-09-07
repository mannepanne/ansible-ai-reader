# ADR: Typed Supabase Client from Generated Schema Types

**Date:** 2026-09-07
**Status:** Active
**Supersedes:** N/A

---

## Decision

Every Supabase client in the codebase carries the `Database` generic from `src/types/database.types.ts`, a file generated from the live schema by `npm run db:types` (`supabase gen types typescript`). Functions that receive a client take `SupabaseClient<Database>`, never the bare `SupabaseClient`. The file is regenerated after every migration, in the same PR as the migration.

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

**pgvector columns are typed as `string`.** The generator has no vector type. supabase-js serialises a `number[]` and PostgREST casts it, so call sites cast (`as unknown as string`) with a comment rather than change what is sent.

**An untyped `SupabaseClient` parameter silently opts out.** A typed client is assignable to the bare type, so a module that declares `db: SupabaseClient` compiles and loses every check. New code takes `SupabaseClient<Database>`; the PR review checklist asks for it.

**The real-schema replay is still required** for what types cannot see: filter values, RPC arguments, RLS behaviour, and whether a query returns the rows you meant. Types make the replay a check on semantics instead of syntax.

## Consequences

- `src/types/database.types.ts` (generated, committed) and `npm run db:types`
- `src/utils/supabase/*.ts`, `src/lib/supabase.ts`, and the three workers construct typed clients
- `src/lib/fika/*.ts`, `src/lib/sync-operations.ts`, `src/lib/archive.ts`, `src/lib/relay/backfill.ts` take `SupabaseClient<Database>`
- Documented in `REFERENCE/architecture/database-schema.md` (Generated Types) and `supabase/migrations/README.md`
