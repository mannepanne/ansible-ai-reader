# ADR: Relay is single-owner; the engagement-gated archive-hook is owner-scoped and reads the live rating

**Date:** 2026-07-10
**Status:** Active

---

## Decision

Stage 2.3b hooks the engagement-gated auto-trigger into the shared sync path (`performSyncForUser`), which
runs for **every** auto-sync user. We accept that Relay is a **single-owner** system and scope the trigger to
one configured owner:

1. **Owner identity is an explicit `RELAY_OWNER_USER_ID`** (env/secret on the main app worker), NOT derived
   from `is_admin`. The trigger-eval phase no-ops for every user whose id ≠ the owner.
2. **The enable-toggle is a boolean column on the owner's `users` row** (`relay_engagement_gate_enabled`,
   default `false`), flippable from the admin Relay tab without a deploy — not a new `app_settings` table.
3. **The engagement filter reads the live `reader_items.rating` column**, not the append-only `item_signals`
   log — a deliberate deviation from the 2.3 spec's original "ignore the legacy rating column" line.
4. **A double-enqueue across overlapping syncs is accepted**, not locked out.

## Context

`performSyncForUser` is the one code path shared by manual sync and the cron auto-sync, and it runs per-user.
The Relay tables have no `user_id` (singleton Durable Object, `idFromName('relay')` — see the
[2026-07-07 orchestrator ADR](./2026-07-07-relay-orchestrator-durable-object.md)). So the moment a trigger
lives in that path, it would fire for **any** user's archives unless explicitly gated. Feeding another user's
private notes/highlights into Magnus's narrator is both a correctness bug and a GDPR problem — the owner guard
is load-bearing, not cosmetic.

Two smaller questions rode along: where the enable-flag lives, and which of the two rating stores the filter
trusts.

## Alternatives considered

- **Owner via `is_admin`:** convenient (no new config) but conflates "can operate the admin UI" with "is the
  single narrator subject." A second admin would silently start feeding the narrator. **Rejected** — the
  single-owner assumption must be explicit and decoupled from the admin role.
- **Enable-flag in a new `app_settings` table:** the "correct" home for a global flag, but it is a new table +
  RLS + API for one boolean. **Rejected (YAGNI).** In a single-owner system the owner's `users` row *is* the
  global scope; this matches the existing per-user-config pattern (`sync_interval`).
- **Rating from `item_signals` (per the original spec):** the append-only log is the strategic direction
  (the `rating` column is labelled "legacy"). **Rejected** because it is factually stale: un-rating
  (`rating: null`) updates the column but skips the signal insert, so the latest signal row survives a cleared
  rating — a lifted 🤷 veto would never actually lift. The spec already reads notes from the **live** column
  "not the `note_added` signal (which survives note deletion)"; ratings have the identical stale-on-removal
  problem, so consistency dictates the live column. Confirmed with Magnus 2026-07-10.
- **Lock out double-enqueue** (advisory lock / claim-then-eval): removes a low-harm race at the cost of real
  complexity. **Rejected** — see trade-offs.

## Reasoning

Owner-scoping as the first guard (a free string compare, before any DB read) makes the GDPR-critical property
the cheapest and most obvious check in the function. The enable-flag on the owner's row keeps the whole feature
behind one default-off boolean with no new infrastructure. Reading the live rating column makes "clear a
rating" mean what the operator expects, and removes the only place the filter's two possible sources disagree.

## Trade-offs accepted

- **The experimental Relay trigger now lives in the core sync path.** Contained by non-fatal handling (a
  trigger-eval throw is logged + recorded but never aborts sync, mirroring archive-sync), but the coupling is
  real and worth watching.
- **Double-enqueue race:** a manual sync and a cron sync overlapping *for the owner* can both scan
  `relay_triggered_at IS NULL`, both see item X, and both enqueue before either stamps → two pending pieces.
  This is inherent to the enqueue-then-stamp self-healing design (chosen so a crash retries rather than
  strands). Harm is low — two rejectable pieces in the human gate — so we accept it rather than add a lock.
- **Single-owner is now assumed in code, not just convention.** Multi-tenant Relay would require revisiting
  the singleton DO, the `user_id`-less relay tables, AND this owner guard together.

## Implications

- New config `RELAY_OWNER_USER_ID` must be set on the main app worker for the gate to ever fire; unset ⟹ the
  admin toggle renders disabled with a note, and trigger-eval always no-ops.
- The enable-toggle is safe to ship on by default in code because the *column* defaults to `false`; nothing
  fires until the owner flips it.
- **Enabling means "react from here forward," not "process the backlog."** While the gate is OFF nothing is
  stamped, so without this the first ON-sync would flood the gate with every engaged archive accumulated
  since the migration (serial ~5-min sessions). So the OFF→ON transition baseline-stamps all currently
  archived, not-yet-evaluated owner rows as seen — the same anti-flood baseline the migration applies once at
  deploy, re-applied at the *real* start moment each time the gate is turned on. Only archives after the flip
  fire. (Chosen over processing the backlog, 2026-07-10; the operator can still manually Run a specific item.)
- If Relay ever becomes multi-tenant, this ADR is the first thing to supersede.

---

## References

- Related ADRs: [2026-07-07-relay-orchestrator-durable-object.md](./2026-07-07-relay-orchestrator-durable-object.md),
  [2026-07-01-relay-session-trigger.md](./2026-07-01-relay-session-trigger.md)
- Relevant spec: `SPECIFICATIONS/relay/stage-2.3-archive-hook-spec.md`
