# Relay — Stage 2.3c: the gate activity log (making the invisible skips visible)

**Status:** SHIPPED (2026-07-12). Reshaped from a dedicated `relay_gate_events` table to two columns on `reader_items` after `/review-spec`; implemented on `feature/relay-gate-activity-log`.
**Slice of:** Phase 2.3 (the archive-hook engine). Extends 2.3b (the engagement-gated hook).
**Depends on:** 2.3b shipped (`evaluateRelayTriggers`, `classifyEngagement`, the `relay_triggered_at` stamp).

## The problem

The decision log (`relay_decisions`) records what the narrator *did with a session* — `wrote` or `declined`. But a session only starts for an archived item that **passes the engagement gate** (`classifyEngagement`). Items that fail the gate — no engagement signal, or a 🤷 veto — are stamped `relay_triggered_at` and silently dropped (`engagement-trigger.ts:146-151`). Their only trace is an aggregate counter in one worker log line (`scanned N, enqueued X, skipped Z, deferred W`).

So when you archive a batch and see two `WROTE` entries and nothing else, you cannot tell from the UI whether the rest were *evaluated and found unremarkable* or *never looked at*. The gate's per-item judgement is computed and thrown away.

**This spec makes the gate's per-item skip decisions durable and reviewable, merged into one chronological "Activity log" alongside the session decisions.**

## Two "decide not to write" layers (the mental model this preserves)

| Layer | Where | Outcome | Persisted today | After this spec |
|---|---|---|---|---|
| **Gate** (`classifyEngagement`) | server-side, per archived item, on sync | react / skip | no (counter only) | **columns on the `reader_items` row** |
| **Session** (`finalizeDecision`) | the agent, after a session runs | wrote / declined | `relay_decisions` row | unchanged |

A gate **pass** is not a terminal outcome — it spawns a session that then produces `wrote`/`declined`. So the two layers must stay **conceptually distinct** (a gate-skip is "never woke the narrator"; a `declined` is "the narrator read it and chose silence"). They are unified only in the **presentation**.

## Decisions (locked with Magnus 2026-07-12; storage shape revised after `/review-spec`)

1. **UI label:** the merged view is the **"Activity log"** (not "Decision log"). It truthfully spans wrote / declined / not-reacted.
2. **Gate outcome is recorded per item, pass *and* skip**, so gate pass-rate is a direct query with no join to sessions. **The UI displays only the skips** (passes are represented downstream by their session decision; surfacing them would double-report).
3. **Signals visible:** a gate-skip entry shows **which engagement signals were present (or none)** — including the veto edge case where signals existed but a 🤷 overrode them.

### Why columns on `reader_items`, not a new `relay_gate_events` table

The `/review-spec` pass (Requirements Auditor, Technical Skeptic, Devil's Advocate) converged on this from two directions:

- **Strategy (Devil's Advocate):** a dedicated table earns nothing here — exactly one event per item, same lifetime as the item, no multi-event or orphan cases. It's conceptual separation only, which doesn't clear KISS/YAGNI.
- **A concrete bug (Technical Skeptic):** the table design needed a *separate* pass-event insert on the hot path. `orchestrator.enqueue()` has **no dedup** (`orchestrator.ts:76-80`), and the `relay_triggered_at` stamp is the only re-enqueue guard. A pass-event insert failing under the "never-miss / leave-unstamped-for-retry" rule would re-enqueue a **second session** → a duplicate `WROTE` row in the very log this builds.

Folding the gate outcome into **the single `UPDATE` that already stamps the item** removes the separate write entirely: no new hot-path insert, no ordering hazard, and open questions Q1 (event-before-stamp ordering) and Q2 (unique-constraint vs re-archive) both dissolve. It also drops a `reader_id → title` join, because the title is already on the `reader_items` row. This reshape is a net *deletion* versus the original table design.

## Data model

New migration `supabase/migrations/20260712_add_relay_gate_columns.sql` — two columns on `reader_items`:

```sql
-- The engagement-gate outcome for this archived item. NULL = not gate-evaluated
-- (never archived-and-scanned, OR baselined by the 2.3b migration). Mirrors the
-- classifier's machine `code`: 'reacted' = passed the gate (a session was enqueued);
-- 'no_signal' / 'vetoed' = skipped (no session).
ALTER TABLE reader_items ADD COLUMN relay_gate_code text
  CHECK (relay_gate_code IN ('reacted', 'no_signal', 'vetoed'));

-- The engagement signals present at gate-eval time, e.g. ["rated_interesting","highlight"].
-- [] = none present. Populated for both pass and skip; only displayed for skips.
ALTER TABLE reader_items ADD COLUMN relay_gate_signals jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Partial index: the Activity-log skip query and the skip-count stat both filter on the
-- skip codes only; keep it small.
CREATE INDEX reader_items_relay_skip_idx ON reader_items (relay_triggered_at DESC)
  WHERE relay_gate_code IN ('no_signal', 'vetoed');
```

**No new RLS.** These are columns on the existing `reader_items` table and inherit its policies; the migration does not touch RLS. (Admin reads go through the service-role client, as elsewhere.)

**⚠️ The baselining subtlety — why an explicit `relay_gate_code`, not "pass = stamped-with-no-skip-reason".** The 2.3b migration baselined every pre-existing archived row with `relay_triggered_at = NOW()`. Those rows were **never actually gate-evaluated**. If we inferred "pass" as `relay_triggered_at IS NOT NULL AND <no skip reason>`, every baselined item would be miscounted as a pass and inflate the pass-rate. An explicit `relay_gate_code` set **only** by `evaluateRelayTriggers` avoids this: baselined items keep `relay_gate_code IS NULL` and are correctly excluded from both counts. *(This is why the column stores the machine code directly rather than deriving pass from absence-of-skip — a refinement beyond the three review reports.)*

**Signal vocabulary** — a single exported constant shared by classifier + UI so the stored strings and display labels can't desync:
`rated_interesting` · `note_ansible` · `note_reader` · `highlight`. A skip with `relay_gate_code = 'no_signal'` has `relay_gate_signals = []`; a skip with `relay_gate_code = 'vetoed'` may still carry signals (e.g. `["highlight"]`) that the veto overrode.

## Changes by file

### `src/lib/relay/engagement-trigger.ts`
- **Structured classifier output.** `classifyEngagement` returns the machine code + signal set, not just a human string:
  ```ts
  export const GATE_SIGNALS = ['rated_interesting', 'note_ansible', 'note_reader', 'highlight'] as const;
  export type GateSignal = typeof GATE_SIGNALS[number];

  export interface EngagementDecision {
    react: boolean;
    code: 'reacted' | 'no_signal' | 'vetoed';   // 'reacted' = pass; else skip reason
    signals: GateSignal[];                        // present signals, populated even on veto
    reason: string;                               // existing human string, kept for worker logs
  }
  ```
  Build `signals` first (from rating/notes/highlights), then branch: veto ⟹ `{react:false, code:'vetoed', signals}`; empty ⟹ `{react:false, code:'no_signal', signals:[]}`; else `{react:true, code:'reacted', signals}`. The pure-filter, no-I/O contract is preserved, and existing tests asserting `reason` substrings still pass.
- **Write the outcome inside the existing stamp `UPDATE` — one write per item, both branches.** Extend `stamp()` to also set `relay_gate_code` and `relay_gate_signals`:
  - **skip branch** (`!decision.react`): `stamp(id, now, decision.code, decision.signals)` — the outcome rides the same UPDATE that already marks the item done. No separate insert, so nothing to lose or duplicate.
  - **pass branch** (enqueue succeeded): keep today's order — enqueue → `stamp(id, now, 'reacted', decision.signals)`. Same single UPDATE as today, with two extra columns. The duplicate-session risk here is exactly the pre-existing 2.3b risk (a stamp failing re-enqueues), **not worsened** — there is no new write.
  - **deferred branch** (no summary yet / enqueue failed): unchanged — no stamp, no code. The item stays `relay_gate_code IS NULL` and is re-scanned next sync. Guarantees "one terminal outcome per item".
- A stamp/update failure stays logged-not-thrown (unchanged self-heal philosophy).

### `supabase/migrations/20260712_add_relay_gate_columns.sql`
New file above.

### `src/lib/relay/activity-log.ts` (new — pure helper, so the merge is unit-testable)
- `mergeActivity(decisions: RelayDecisionRow[], skips: GateSkipRow[]): RelayActivityRow[]` — concat, sort `createdAt` DESC, **stable tiebreak on equal timestamps** (`kind` then `id`), return the merged list (already capped by the callers' `.limit(200)` each). Extracting this out of the server component is the only way the DoD's merge/tiebreak tests are achievable — `admin/page.test.tsx` blanket-mocks the client and tests auth guards only.

### `src/app/admin/page.tsx`
- Add two count queries and one skip fetch (title is already on the row — **no join needed**):
  ```ts
  db.from('reader_items').select('*', { count: 'exact', head: true }).eq('relay_gate_code', 'reacted'),           // gatePass
  db.from('reader_items').select('*', { count: 'exact', head: true }).in('relay_gate_code', ['no_signal','vetoed']), // gateSkip
  db.from('reader_items')
    .select('id, reader_id, title, relay_gate_code, relay_gate_signals, relay_triggered_at')
    .in('relay_gate_code', ['no_signal', 'vetoed'])
    .order('relay_triggered_at', { ascending: false })
    .limit(200),
  ```
- Map decisions + skips into `RelayActivityRow[]` via `mergeActivity`, hand to LogPanel.

### `src/components/admin/types.ts`
- Discriminated union with `id` on **both** arms (so pagination can't jitter on equal timestamps):
  ```ts
  export type RelayActivityRow =
    | ({ kind: 'decision'; id: string } & RelayDecisionRow)
    | { kind: 'gate_skip'; id: string; createdAt: string;
        code: 'no_signal' | 'vetoed'; signals: string[];
        stimulusRef: string; stimulusTitle: string | null };
  ```
- Extend `RelayStats.counts` with `gatePass: number; gateSkip: number`.

### `src/components/admin/RelayAgent.tsx`
- `LogPanel` takes `RelayActivityRow[]`; heading → **"Activity log"**, empty text and footer copy updated ("N activity entries", not "N decisions"); sweep the `view === 'log'` toggle label for stray "decision" copy.
- Three visual treatments: `WROTE` (green, existing), `DECLINED` (grey, existing), `NOT REACTED` (visually distinct — muted/dashed card, no session provenance). The skip card shows: timestamp, `NOT REACTED` badge, `on: <title>`, the reason **derived from `code`** (`no_signal` → "no engagement signal", `vetoed` → "vetoed (rated 🤷)"), and `signals: rated interesting · highlight` or `signals: none` (labels mapped from the shared `GATE_SIGNALS` vocabulary — display strings live in the UI, data stays as codes).
- **Gate-off affordance:** when `RelayStats.engagementGate.enabled` is false, render a short "engagement gate is off — no items are being evaluated" note, so an empty skip section isn't misread as "gate on, nothing skipped".

## Edge cases (for the requirements audit)

1. **Veto with signals present** — item rated 🤷 *and* highlighted ⟹ `code:'vetoed', signals:["highlight"]`. UI shows both the veto reason and the overridden signal. (Motivates structured signals.)
2. **Gate disabled (default-off)** — `evaluateRelayTriggers` short-circuits; no `relay_gate_code` is ever set. Skip section empty; the gate-off note (above) distinguishes this from "nothing skipped".
3. **Deferred item never terminates** — re-scanned every sync, `relay_gate_code` stays NULL, writes nothing until it terminates. No noise, no duplicate.
4. **Baselined pre-existing items** — `relay_triggered_at` set by the 2.3b migration but `relay_gate_code IS NULL` ⟹ excluded from both counts and the skip list. Correct by construction (see the baselining note above).
5. **Re-archive (archive → un-archive → re-archive)** — **resolved as not-real:** only `stamp()` and the gate-toggle baseline ever write `relay_triggered_at`, and neither clears it; nothing un-stamps on un-archive. An item is gate-evaluated at most once, ever. (Reopens only if a future un-archive feature clears the stamp.)
6. **Crash after a pass (known limitation)** — a gate-pass whose session crashes leaves `relay_gate_code:'reacted'` but no `relay_decisions` row, so it shows nowhere (passes aren't displayed; no decision exists). Acceptable; recoverable later via an orphan query (`relay_gate_code='reacted'` with no matching decision). Stated so it's not a surprise.
7. **Merge tiebreak** — equal `created_at` across the two sources (independent clocks) resolves by `kind` then `id`; the tiebreak test must use a decision and a gate_skip with identical timestamps.
8. **Volume cap** — up to 200 decisions + 200 skips merged in memory. Fine at this scale; surface the cap in the footer ("showing 200 of N") so it isn't misread as "nothing else was skipped".
9. **Hard-deletion retention asymmetry — resolved (moot).** A skip reason lives on the `reader_items` row; a `relay_decisions` row (bare `text[]`, no FK) would survive the item. Verified during `/review-spec`-team: there is **no hard-delete of `reader_items` in app code** — items are soft-archived via the `reader_deleted` flag; the `.delete()` calls in the codebase hit `processing_jobs` and demo tables only. So the asymmetry cannot arise today. Reopens only if a `reader_items` purge is added.

## Open questions

**All resolved by the review** — none blocking:
- Q1 (event ordering) — **dissolved**: the outcome rides the single stamp UPDATE; no separate insert.
- Q2 (unique constraint vs re-archive) — **dissolved / resolved**: no constraint (columns), and re-evaluation is not-real in current code (edge 5).
- Q3 (store display string vs derive) — **decided: derive from `code`** (data stays as codes, display strings live in the UI, matching the existing LogPanel).

*Standing judgement call (not blocking):* this is observability on a default-off mechanism while the voice/taste loop is signal-starved. Building it now is a conscious choice over thickening that signal — Magnus has chosen to proceed.

## Deploy order (prerequisite)

**Apply `20260712_add_relay_gate_columns.sql` BEFORE enabling the engagement gate.** The *read* path degrades safely pre-migration (count queries `?? 0`, skip fetch `?? []` — the admin page just shows zeros). The *write* path does not: with the gate ON but the columns absent, the stamp `UPDATE` (now writing `relay_gate_code`/`relay_gate_signals`) would fail, leave the item unstamped, and re-enqueue it next sync — reintroducing the duplicate-session bug the reshape dissolved. The gate is default-off, so the safe order is: apply migration → deploy → flip the gate on. (Flagged by the product reviewer on PR #141.)

## Definition of Done

1. **Tests first, passing, 95%+/90%** —
   - `classifyEngagement` structured output incl. veto-with-signals (`code` + `signals`).
   - `evaluateRelayTriggers` sets `relay_gate_code`/`relay_gate_signals` in the stamp UPDATE on both skip and pass, writes nothing on defer, and is read-once/idempotent under re-scan. (Budget ~12 existing `engagement-trigger.test.ts` outcome tests to gain a parallel gate-columns assertion.)
   - `mergeActivity` ordering, equal-timestamp tiebreak (different kinds), and cap.
   - `LogPanel` renders all three kinds, the signals line (incl. "none"), and the gate-off note.
   - Baselined items (code NULL) excluded from counts.
   - `npx tsc --noEmit` clean.
2. **Docs updated** — `REFERENCE/architecture/` relay data model gains the two `reader_items` columns; this spec's status → shipped; `stage-2-roadmap.md` 2.3 section notes the 2.3c slice; ABOUT comments on new/changed files.
3. **Code quality** — conventions, no secrets, clean history, matches existing relay style; the `GATE_SIGNALS` vocabulary is a single shared const imported by classifier + UI.
