# Relay — Stage 2.3: The archive-hook engine + rich stimulus (spec)

**Status:** **DRAFT v2 — revised after `/review-spec` (3-lens: requirements / feasibility / strategy).** Reshaped to **two slices** (2.3a rich stimulus, 2.3b engagement-gated hook); the highlight-**text** sync-and-store is **dropped** (value didn't match expense — §E). Three blocking findings folded in: **owner-scoping** (multi-user/GDPR), **self-healing idempotency** (missed-trigger, not double-trigger), **note source** (Reader-authored notes). Builds on Stage 2.1 (grounding) + 2.2 (voice/taste). North star: `SPECIFICATIONS/ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md`.

## Problem

Relay reacts only to a **manual** trigger today: an operator opens the admin tab, types a `reader_id`, clicks run. The north-star wants Relay to react to **the thing on the desk** — an item you just archived in Readwise Reader — and specifically to your **engagement** with it, not the bare fact of archiving. Most archives are low-signal (batch headline-dumps cleared unread); those must **not** trigger. Triggered reactions still land in the **human gate** (Relay stays blind to the gate, per Stage 1/2.2).

## What's decided (forks + the post-review reshape)

1. **Trigger = poll-hook** (reuse the archive-sync poll; no webhook). No real-time need.
2. **Filter = strong signal required** — a **💡 interesting rating**, **a note**, or **≥1 highlight** (by *count*). Bare click-through / generated commentariat do not qualify. A 🤷 not-interesting rating vetoes.
3. **Highlights = COUNT only** (revised from "full text"). The trigger uses `highlights_count`, which the archive response already returns for free. The highlight **text** sync-and-store is **dropped** — see §E for the reasoning.
4. **Batch = one session per item** (the DO serialises; braiding deferred).
5. **Two slices (post-review reshape):** ship the mechanism in the smallest useful increments — **2.3a** enriches the stimulus, **2.3b** adds the engagement-gated hook. No new table in either.

## What already exists (hooks we build on)

- **Archive-sync poll:** `performSyncForUser()` (`src/lib/sync-operations.ts`) calls `fetchRecentlyArchivedItems(apiToken, updatedAfter)` each sync and flips `reader_items.archived = true, archived_at = NOW()` on newly-archived items (selecting `WHERE archived_at IS NULL`).
- **The archive response already carries what the filter needs, and sync discards it:** `ArchivedReaderItemSchema` (`src/lib/reader-api.ts`) includes **`highlights_count`** and **`notes`** (the Reader-authored note), but the archive step maps only `id` + `updated_at`. Retaining those two fields is the crux of 2.3b (fixes the "Reader-side note never reaches the filter" bug).
- **Engagement data in Ansible:** `short_summary` (auto), `commentariat_summary` (+`commentariat_generated_at`, on-demand), `tags[]`, `document_note` (Ansible-authored note, one-directional Ansible→Reader). Interest signals in append-only `item_signals` (`item_id` → `reader_items.id` UUID, **not** `reader_id`). The engagement filter reads the **live `reader_items.rating`** column (`4` interesting / `1` not-interesting / `null` neutral), not `item_signals` — decision 2026-07-10, see §B for why (un-rating skips the signal insert, so the log goes stale).
- **The trigger target:** the manual admin button (`src/app/api/admin/relay/run/route.ts`) resolves the singleton `RelayOrchestrator` DO (`idFromName('relay')`) and `fetch`es `/enqueue {readerId}`. Confirmed reachable from sync: cron → HTTP → the main worker, which declares the `RELAY_ORCHESTRATOR` binding; the binding is in the `env` already passed to `performSyncForUser`. **No new orchestration.**

## Goals (2.3 delivers)

- **G1 (2.3a).** Rich stimulus: the session prompt is assembled from summary + tags + commentariat + note (not just title/summary/commentariat as today).
- **G2 (2.3b).** An engagement filter classifying a newly-archived item *react* / *skip*, read entirely off data we already have.
- **G3 (2.3b).** An **owner-scoped, self-healing** poll-hook that enqueues a session on the existing DO — at most once per archive, never silently lost.
- **G4.** Gate-blindness + rating-bias preserved (ratings filter server-side only; never in the prompt).

## The two slices

- **2.3a — rich stimulus (tiny, high-learning, zero new infra).** Enrich the *existing manual* trigger's prompt with note/tags/commentariat. Proves richer stimulus writes better pieces before any trigger machinery exists.
- **2.3b — the engagement-gated archive-hook.** Retain `highlights_count`+`notes` on the archive step; add the filter, owner-scoping, the idempotency column, and the enqueue. Adds **3 columns, no table**.

## Non-goals (deferred / dropped)

- **Highlight-text sync-and-store — dropped** (§E). Highlight *count* is used; the passages are not.
- **Braiding / cross-cut** (one session per item).
- **Full unattended always-on automation at scale** — Phase 2.5. 2.3 ships the mechanism behind an operator **enable toggle, default-off**; 2.5 turns it on and hardens volume/cost.
- **A real Readwise webhook** (decided against).

## Design

### A. Rich stimulus (2.3a)

Enrich the orchestrator's fetch (`src/lib/relay/orchestrator.ts`, today `.select('title, short_summary, commentariat_summary')`) and `formatStimulus` + `StimulusRow` (`session-run.ts`) to add **tags**, **note** (`document_note` and/or the retained Reader `reader_note`, §C), and **commentariat**. Applies to the manual trigger immediately; 2.3b's auto-trigger reuses it.

**`formatStimulus` guard:** it throws when `parts.length <= 1`. Adding parts must not let a **summary-less** item newly satisfy the guard and spend a session on a title-only stimulus — the summary requirement is enforced in §C, and a dedicated test asserts a highlight-only, summary-less item does not trigger.

### B. The engagement filter (2.3b) — strong signal, from existing data

Classify a candidate archived item *react* / *skip*:
- **💡 interesting** — the item's **live** `reader_items.rating` column is `4` (interesting). *(Decision 2026-07-10, deviates from the original "read `item_signals` latest / ignore the legacy rating column" line — see below and the 2026-07-10 single-owner ADR.)* A `1` (not-interesting) is the veto.
- **note** — a note exists: `document_note` non-empty (Ansible-authored) **OR** `reader_note` non-empty (the retained Reader-authored note, §C). Reading the live column(s), not the `note_added` signal (which survives note deletion).
- **highlight** — `highlights_count >= 1` (retained from the archive response, §C).

**Why live rating, not `item_signals` (decision 2026-07-10).** Un-rating (`rating: null`) updates the live
column but **skips** the `item_signals` insert, so the latest signal row survives a cleared rating — a lifted
🤷 veto would never actually lift. This is the identical stale-on-removal problem this spec already avoids for
notes ("read the live column, not the `note_added` signal"). Applied consistently, the filter reads the live
`reader_items.rating`. The rating is still used server-side only and never enters the prompt (§D).

**React iff ≥1 of the above AND the latest rating is not `rated_not_interesting`** (explicit 🤷 vetoes even if highlighted — respect the verdict; consistent with gate-blindness). Click-through and commentariat-generation never trigger.

### C. The poll-hook (2.3b) — owner-scoped, self-healing, a final sync phase

**Owner-scoping (blocking fix #1).** Relay is a **single-owner** system (singleton DO; relay tables have no `user_id`). But `performSyncForUser()` runs for **every** auto-sync user. The hook **must no-op for every user except Relay's owner**, or another user's private highlights/notes would feed Magnus's narrator (a correctness *and* GDPR problem). Gate trigger-eval on `syncUserId === RELAY_OWNER_USER_ID` (a configured value; today = Magnus). Record the single-owner assumption as an ADR ("Relay is single-user until multi-tenant").

**Self-healing idempotency (blocking fix #2).** The archive step stamps `archived_at` for the whole delta *before* trigger-eval; a crash (or the 14-min cron cap) in that gap would strand items as `archived` but never-evaluated, and the next sync's archive step won't re-detect them (`WHERE archived_at IS NULL`). So the real failure mode is a **missed** trigger, not a double one. Design a proper work-queue marker:
- **Migration** adds `reader_items.relay_triggered_at (timestamptz null)`, and **baselines it**: `SET relay_triggered_at = NOW()` for all **existing** archived rows — so history never fires and there is no first-deploy flood.
- **Archive step** (extended): on new archives set `archived=true, archived_at=NOW()`, retain **`highlights_count`** and **`reader_note`** (from the response), and leave `relay_triggered_at` **NULL**.
- **Trigger-eval** (new **final** sync phase, after unread + archive steps): if not the owner, return. Else `SELECT` archived rows `WHERE relay_triggered_at IS NULL` (this standing scan *is* the recovery mechanism — safe because of the baseline). For each, apply §B, with this outcome table:
  - **qualifies + summary present** → `fetch` the DO `/enqueue {readerId}`; on **success**, stamp `relay_triggered_at = NOW()`; on **enqueue failure**, leave NULL (retries next sync).
  - **skips (no engagement / 🤷 veto)** → stamp `relay_triggered_at = NOW()` (permanent skip; don't re-evaluate forever).
  - **qualifies but summary not ready** (async summary job hasn't run) → leave NULL (retry next sync once the summary lands). This is the summary-guard.
- **Batch:** several qualifying items each enqueue; the DO runs them serially. No debounce (one-per-item).

This is simpler than threading an in-memory delta through the sync phases *and* it is self-healing: crashed and enqueue-failed items are naturally retried; skipped and succeeded items are marked done; history and other users never fire.

### D. Gate-blindness + rating-bias (G4)

Ratings (💡/🤷) are used **server-side for the filter only** and are **never** placed in the prompt — telling the agent "Magnus rated this interesting" would bias it toward writing (it would feel commissioned), undercutting the restraint the project depends on. The **content** signals enrich the prompt: the note(s) (Magnus's own thought), tags, commentary. A blindness test asserts ratings do not appear in the assembled stimulus (analogous to the 2.2a Channel-2 blindness test).

### E. Considered and dropped: the highlight-text store

The kickoff chose "full highlight text." A live API probe (kept for the record) then showed: highlights are v3 **child documents** (`category=highlight`, `parent_id` = the article, text in the **`content`** field), and — decisively — **the v3 list has no `parent_id` filter**, so there is *no cheap on-demand fetch of one document's highlights*; it is a full **sync-and-store** (new table, RLS, ~1041-row resumable backfill under a shared 20/min limiter, ~830 lines of test-mock churn) or nothing. Weighed against its value, we dropped it:
- The highlight **passages are a subset of the article Relay already reads** — a salience marker, not new information.
- Feeding "the exact sentences Magnus marked" is a soft cousin of the **rating-bias** we deliberately design out in §D — it would steer Relay toward Magnus's emphasis instead of its own reading.
- The trigger needs only the **count**, which is free on the archive response.

So highlight *count* is a trigger signal; the text is not sourced. (Revisit only if a concrete need for the passages appears.) With the store gone, the **backfill, the FK/cascade question, the rate-limiter contention, and the highlight-sync-before-filter ordering dependency all disappear.**

## Data model changes

- **`reader_items.relay_triggered_at timestamptz null`** — the work-queue marker (baselined to `NOW()` for existing archived rows in the same migration).
- **`reader_items.highlights_count int not null default 0`** — retained from the archive response (filter input; recovery-readable).
- **`reader_items.reader_note text null`** — the Reader-authored note retained from the archive response (filter input + stimulus enrichment; kept separate from Ansible-authored `document_note` to avoid clobbering).
- **No new table.**

## Blast radius, cost, latency

- **Sync gains a retain-two-fields tweak (archive step) + a final trigger-eval phase.** Trigger-eval failure must be non-fatal to the rest of sync (mirror archive-sync's log-and-continue).
- **Test churn (real cost):** `sync-operations.test.ts` is ~830 lines of Supabase mock chains; the new `.from('item_signals')` / trigger-eval calls will disturb existing mocks — budget rework, plus new filter/hook tests. Not a rounding error.
- **Trigger latency = sync interval** (acceptable).
- **DO serial:** a big engaged batch enqueues several ~5-min sessions serially; acceptable for now (default-off toggle guards the first enable), noted for 2.5. Consider a "skip if DO queue depth > N" cap at enable time.
- **Coupling:** the experimental Relay trigger now lives in the core sync path; the non-fatal handling contains it, but keep an eye on it (an ADR records the single-owner + coupling constraints).

## Open questions (trimmed — most resolved)

1. **Concurrent sync + engagement mutation** (note deleted the instant after the filter reads it): accept the race (last-writer-wins, self-heals next sync) — stated, not mitigated.

*(Resolved by the reshape/review: 🤷 veto = veto wins; highlight-text store = dropped; note source = archive `notes`; idempotency = self-healing standing scan with baseline; summary guard = leave-NULL-retry.)*

*(Resolved by Magnus 2026-07-10, before 2.3b build):*
- **Enable-toggle = an admin-flippable flag, default-off** — a setting in the admin Relay tab, toggled without a deploy. (Not an env var — chosen for live flip-ability once 2.3b lands.)
- **Owner identity = an explicit `RELAY_OWNER_USER_ID` configured value** (env/secret), NOT derived from `is_admin` — keeps the single-owner assumption explicit and decoupled from the admin role. Record the single-owner assumption as an ADR.

## Testing

- Stimulus assembly (2.3a) — includes note/tags/commentary; **excludes ratings** (blindness/bias test).
- Filter (2.3b) — each strong signal independently (live 💡 rating=4; Ansible note; Reader `reader_note`; `highlights_count>=1`); 🤷 veto (rating=1); no-signal skip; click-through-only skip.
- **Owner-scoping** — a non-owner user's qualifying archive does **not** enqueue.
- **Self-healing idempotency** — success stamps and does not re-fire; enqueue-failure leaves NULL and retries next sync; no-engagement skip stamps; **summary-not-ready leaves NULL and fires once the summary lands**; the migration baseline means a first post-deploy sync fires nothing on history.
- The filter reads engagement fields directly off the scanned `reader_items` row (rating/notes/highlights) — no separate `reader_id → item_id` resolve needed; the append-only `item_signals` log is not consulted.
- Trigger-eval failure is non-fatal to the rest of sync.

## Rollout

- Migration (3 columns + baseline stamp of existing archived rows).
- Ship **2.3a** first (stimulus enrichment on the manual trigger) — observe better pieces, no trigger risk.
- Ship **2.3b** with the toggle **default-off**; flip it on and watch the first qualifying archive flow through to a pending piece in the gate.
