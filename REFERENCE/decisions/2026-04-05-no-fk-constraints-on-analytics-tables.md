# ADR: No foreign key constraints between analytics tables

**Date:** 2026-04-05
**Status:** Active
**Supersedes:** N/A

---

## Decision

The four analytics tables — `email_captures`, `demo_sessions`, `demo_events`, and `page_events` — have no foreign key relationships between them, despite sharing a common `session_id` UUID.

## Context

The analytics system links events to sessions and sessions to emails using a shared `session_id` UUID written to localStorage. When designing the schema, the natural instinct is to enforce this relationship with foreign keys (e.g. `demo_events.session_id REFERENCES demo_sessions(session_id)`). The decision was made not to do this.

## Alternatives considered

- **Foreign key from `demo_events` to `demo_sessions`:**
  Enforces referential integrity — every event row is guaranteed to have a parent session.
  - Why not: The anon Supabase client writes both tables, but in a fire-and-forget pattern. There is a small window between session creation and the first event where an FK violation could occur. More importantly, adding an FK forces a cascade delete configuration — which must be correct for GDPR deletion to work safely.

- **FK with `ON DELETE CASCADE`:**
  Deleting a session row would automatically delete its events.
  - Why not: Cascade behaviour is invisible to future developers querying the data. GDPR deletes become implicit, making it easy to accidentally delete more data than intended (or believe data has been deleted when it hasn't). Explicit delete logic in the admin API routes is safer and auditable.

- **No foreign keys, shared UUID (chosen):**
  Tables are independent. `session_id` is a convention, not a constraint. Rows in `demo_events` can exist even if the corresponding `demo_sessions` row was deleted. Admin API routes handle GDPR deletion explicitly per table.

## Reasoning

**RLS simplicity:** Each table can have its own independent INSERT policy for the `anon` and `authenticated` roles without needing to coordinate with related tables. FK constraints can interact unexpectedly with RLS in Supabase — avoiding FKs removes an entire category of subtle permission bugs.

**GDPR delete safety:** The admin GDPR delete routes (`/api/admin/gdpr/delete`) delete rows from each table individually by email or session ID. With FK cascades, a delete on a parent table would silently propagate — easy to misconfigure. With independent tables, each deletion is explicit and auditable.

**Write ordering independence:** The anon client writes `demo_sessions` on mount and `demo_events` on each interaction. In a race condition or retry scenario, an event could theoretically arrive before its session row. Without an FK, this is handled gracefully (the event row exists, session row arrives shortly after). With an FK, it would be a constraint violation.

**Analytics tables are append-only logs:** The relationship between these tables is analytical (join on `session_id` in queries), not transactional (enforce consistency on write). Analytical joins don't require FKs — they require correct data, which is ensured by the tracking code, not the database.

## Trade-offs accepted

**No database-enforced integrity:**
An event row can exist without a corresponding session row, or a session row can be deleted while event rows remain. The database will not catch this.
- Accepted: The tracking code always creates a session before writing events. Orphaned rows (e.g. from partial GDPR deletes) do not break any functionality — they are simply ignored by dashboard queries that join on `session_id`.

**GDPR delete requires explicit per-table logic:**
Cannot rely on `ON DELETE CASCADE` to clean up child rows automatically.
- Accepted: Explicit deletion is more auditable. The admin API routes handle this and are covered by tests.

**Future joins require awareness of the no-FK design:**
A developer writing a new analytics query might expect FK-enforced joins and be surprised to find orphaned rows.
- Accepted: This ADR documents the reasoning. The reference docs note it explicitly.

## Implications

**Enables:**
- Independent RLS policies per table without FK interaction complexity
- Safe, explicit GDPR deletion with no hidden cascade behaviour
- Write-order independence between session creation and event writes

**Prevents/complicates:**
- Cannot rely on database cascade for cleanup — all multi-table deletes must be explicit
- Any future analytics table that references `session_id` should follow the same pattern (no FK, independent INSERT policies, explicit GDPR delete logic)

---

## References

- Reference doc: [landing-page-and-demo.md — Database Tables](../features/landing-page-and-demo.md#database-tables)
- Admin GDPR routes: `src/app/api/admin/gdpr/`
- Migration: `supabase/migrations/20260405_fix_analytics_authenticated_access.sql`
