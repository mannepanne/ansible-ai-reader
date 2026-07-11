# Relay — Stage 2.2: Voice & the editorial/taste loop (spec)

**Status:** **2.2a COMPLETE incl. §G DoD.** Machinery implemented 2026-07-09 (branch `feature/relay-stage-2.2a-capture`; full suite, `tsc`, `next lint` green; migration `20260709_add_relay_piece_review_capture.sql` run in Supabase). The §G hand-distillation loop was then closed end-to-end on real data (2026-07-10, PR #128): the `debottlenecking` approve-note → a "The knowing nudge" anti-tell in `craft-and-cadence.md` → re-pushed to the pinned agent → a live run (see the [stage-2 roadmap](./stage-2-roadmap.md) §G block for the full trace and the honest *consistent-with, not causal* caveat on the single run). The capture corpus is still thin (the edit-capture path is unexercised); ongoing note/edit discipline feeds **2.2b** (editor-agent + distiller), which follows once a captured corpus exists. Revised post-`/review-spec` (3-lens team review — APPROVED WITH CONDITIONS, all conditions folded in).

**Build note (a §H simplification):** because Magnus chose **curated checked-in exemplars** (not auto-drawn), the exemplar path has **no DB reader at all** — the whole system-prompt assembly is DB-free. So blindness is *structural*, stronger than the review's §H assumed: the test asserts the assembly modules (`persona.ts`, `exemplars.ts`) and the recall SQL reference **no** Channel-2 column, and that `exemplars.ts` imports no DB client — there is simply no query that could pull `original_body` into the agent's context.
**Roadmap:** [stage-2-roadmap.md](./stage-2-roadmap.md) Phase 2.2 · **North star:** [ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md](../ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md) — "voice sharpening over time; remember rejections/edits."
**Design memory:** [[relay-agent-editorial-design]] (restraint/variety is a memory + material feature, not a prompt feature).

## Problem

Voice is the whole project — "it lives or dies on how the writing reads." Yet today the system **cannot learn Magnus's taste**. Three concrete gaps, verified in code:

1. **A rejection captures no *why*.** `rejectPiece` (`src/lib/relay/approval.ts:84-105`) flips `state='rejected'`, nulls the embedding, and stops. The row is *retained* (never deleted) but inert — no reason, no note, nothing to learn from. The roadmap's "the embedding is cleared and it's forgotten" is imprecise: the embedding was never set (only `approvePiece` embeds); the real loss is that the *judgment* evaporates.
2. **There is no way to fix a line before approving.** `approvePiece` takes `{id}` only, re-fetches the *stored* body, and embeds it as-is (`approval.ts:35-77`). Magnus can approve or reject, but not approve *this, but with that line fixed* — so the single richest taste signal (the actual fix) is impossible to capture.
3. **Voice is five static documents, identical every run.** `assembleSystemPrompt` (`src/lib/relay/persona.ts:29-35`) concatenates `trunk → grain → rings → cadence → coda` unchanged each session. The one on-page style example (`ansible-agent-craft-and-cadence.md:81-128`, "Seeing like a vendor") is hardcoded. Nothing from the growing approved corpus feeds voice back; the persona docs *narrate* a feedback loop (`commitments-and-antagonisms.md:192`) that **does not exist in code**.

This phase closes the loop from Magnus's judgments back into the writing — **without ever letting the agent see the gate** (`stage-1-technical-spec.md:62` "it must believe it publishes to the world"; A4).

## The core principle — two channels that must not mix

Gate-blindness (`stage-1-technical-spec.md:62`, A4) is absolute and it *splits* the taste loop cleanly:

- **Channel 1 — positive, agent-visible.** Approved pieces are already the agent's memory (the `recall` corpus, filtered `state='approved'`). Feeding *approved* work back as a style anchor reveals **no new outcome** — it is blindness-safe. This is the curated exemplar (§E).
- **Channel 2 — corrective, agent-invisible.** Rejections, edit-deltas, notes, and (in 2.2b) the editor-agent's critique are captured and distilled into **anti-tells authored into the craft doc** — the agent reads *principles* ("cut the announced turn"), never *its own rejected drafts or any outcome*. This channel closes at the **human/editorial-authoring layer**, never in a session.

> Showing the writing agent "you wrote this near this stimulus and it was spiked" would break blindness *and* anchor it to the reject. So the anti-example loop is authored into the craft doc, not injected into recall. This is the spine of the phase.

### The accretion constraint (named per review — Devil's Advocate)
Channel 2 is a **monotonic prompt-growth** mechanism sitting inside a project whose own principle is "variety comes from *material*, not prompt." Left unchecked it manufactures the exact pathology the spike documented (fixed prompt rules breed fixed tics). So the design constraint, stated up front:
- **Varied exemplars (Channel 1) are the PRIMARY anti-tic lever** (spike-proven). Distilled anti-tells are a **capped, prunable secondary supplement.**
- **Channel 2 retires and replaces, it does not only accumulate.** The "tells to cut" list has a soft cap; a hand-distillation pass may *remove* a stale tell as readily as add one. Curation over growth.

#### Pending, conditional: "dull title" as a Channel 2 reject dimension
Titles were the observed weak spot — dull and under-specified. The first fix (PR #137) is deliberately the *lighter* set of levers, ordered by ascending force: a craft-doc budget rule ("the title is craft too"), a title-sharpening step in the operating-coda editorial reread, and exemplar framing that points at the title. This is the "material + process, not Channel 2 machinery" bet — consistent with the accretion constraint above (don't grow the anti-tell list before the lighter levers are shown to fall short).

**The conditional follow-up:** *if* titles stay dull after PR #137 — judged by monitoring live posts, not a regeneration — then a "dull title" ✗/✓ anti-tell is earned and gets hand-distilled into `craft-and-cadence.md` (the §G loop), with an "under-specified title" reject/edit note becoming a first-class capture dimension. Until that evidence exists, this stays deferred; wiring the correction loop before the lighter levers have failed would manufacture the exact prompt-growth pathology the accretion constraint guards against.

## What already exists (hooks we build on)

- ✅ Rejected pieces are **retained** in `relay_pieces` (`state='rejected'`), not deleted — substrate is there, only the *reason* is missing.
- ✅ The review path is thin and symmetric: `src/app/api/admin/relay/review/route.ts` → bridge `/approve`|`/reject` → `approve/rejectPiece`. Adding `note`/`edited_body` threads cleanly through it. `relay_pieces` is service-role-only (RLS zero-policy) → no new RLS policy, nullable columns → no backfill.
- ✅ `ansible-agent-craft-and-cadence.md` **already speaks the target format.** "The tells to cut" (lines 34-59) is a list of **✗ (from your own drafts) → ✓ (how it should read)** pairs. An edit-delta *is* a ✗/✓ pair. Channel 2 feeds a format that exists.
- ✅ The admin surface (`RelayAgent.tsx`) already renders pending/approved/rejected sub-tabs with 2.1 grounding badges — the review UI to extend is in place.
- ✅ The curated-exemplar config mirrors the proven 2.1 `trusted-sources.ts` pattern (a checked-in list, no DB-driven UI).

## Goals (2.2 delivers)

1. **Capture the *why*.** Every reject (and optionally an approve) can carry a structured review note / reason. *(2.2a)*
2. **Capture the *fix*.** Approve-with-edit stores the pre-edit body; the delta (original → edited) is preserved as taste signal. *(2.2a)*
3. **Make the signal findable.** The captured notes/edits are retrievable in the admin surface so a periodic distillation pass is practical. *(2.2a)*
4. **Positive anchor (Channel 1).** The hardcoded exemplar becomes a **curated, hand-picked, rotating** draw from approved pieces. *(2.2a)*
5. **Distil signal into voice (Channel 2).** Captured reasons + edit-deltas are distilled — by hand first, agent-assisted later — into ✗/✓ anti-tells in `craft-and-cadence.md`, human-approved before commit. *(2.2a closes the loop once by hand; 2.2b automates the proposing.)*
6. **Assist the human (2.2b).** A cheap **editor-agent** critiques a draft *after* Magnus's own read (a second opinion, never before — preserves his read as the calibration loop), for his eye only.
7. **Preserve gate-blindness absolutely.** Nothing in Channel 2 ever enters a writing session.

## Non-goals (deferred)

- **Archive-hook / rich engagement stimulus** → 2.3.
- **Auto-applying distilled anti-tells** without a human commit — the craft doc stays human-authored; distillation only *proposes*.
- **Auto-drawing exemplars** from the corpus — rejected in favour of curation (entrenchment risk); revisit if curation proves too heavy.
- The blog (2.4), automation (2.5), the frontier / rollups (Stage 3).
- Any surfacing of approval *outcomes* to the agent.

## Design

### Slice 2.2a — Capture the why, capture the fix, make it findable, curate the exemplar

#### A. Rejection-reason / review-note capture
Extend the review path end-to-end with an optional free-text note:
- `review/route.ts` accepts `{ id, action, note? }` (note trimmed, capped ~2 KB; existing admin gate unchanged).
- Bridge `/approve` `/reject` forward `note`; `approve/rejectPiece` persist it.
- **Data:** `relay_pieces.review_note text` (nullable). Applies to both actions.
- **Marks fold into the note.** Structured span-level `review_marks` is **dropped** from 2.2a (a fast-follow only if a real practice pass shows free-text loses the span-localisation signal).

#### B. Approve-with-edit + edit-delta capture
- The admin review UI gains an **editable body** on a pending piece. Approving with changes sends the edited body.
- `approvePiece` accepts an optional `edited_body`. When present, non-empty (rejects empty/whitespace), and `≠` the stored body: **store the original** (write-once, below), replace the body, and **embed the edited text** (recall reflects what Magnus endorsed — see the embedding stance).
- **Data:** `relay_pieces.original_body text` (nullable).
  - **`original_body` is WRITE-ONCE** — set only when currently `NULL`. Invariant: *`original_body` = the piece as Relay first wrote it, before any human edit.* Stable across `edit → reject → re-approve-with-new-edit`; a later edit never clobbers the first delta. The delta is derivable (`original_body` vs `body`); no separate diff stored.
- **Embedding stance (decided, per review):** approve-with-edit **embeds the edited body**. Magnus's edits *are* the taste, and an edited-to-good piece *is* exemplary; `original_body` write-once preserves the delta for Channel 2. (Devil's Advocate's concern — heavy rewrites putting Magnus's prose into the "own voice" corpus — is bounded: `recall` surfaces summary/concepts, not the full body as a style few-shot, and Channel 1's exemplar is separately hand-curated.)

#### C. Idempotency / capture truth table (resolves the review's B1/B2)
**Principle: a review action always records the human judgment; it never silently discards a note or edit. The state-guards prevent double-*publishing* (double-embed), not re-*annotating* — capture is decoupled from the embed/transition guard.**

| Current state | Action | State transition | `review_note` | `edited_body` | Result |
|---|---|---|---|---|---|
| `pending_review` | approve (+note?/+edit?) | → `approved` | persist if present | apply if present, non-empty, ≠ body → store `original_body`, replace body, re-embed | persist |
| `pending_review` | reject (+note?) | → `rejected` | persist if present | n/a | persist |
| `approved` | reject (+note?) | → `rejected` (un-approve) | persist if present | n/a | persist |
| `approved` | approve (+note?) | none | persist in place | **IGNORED** (no re-edit of an endorsed body in 2.2a) | persist note, no embed |
| `rejected` | approve (+note?/+edit?) | → `approved` | persist if present | apply if present, non-empty, ≠ body → store `original_body` (iff NULL), re-embed | persist |
| `rejected` | reject (+note?) | none | persist in place | n/a | persist note, no embed |
| `approved` | approve (no note/edit) | none | — | — | no-op |
| `rejected` | reject (no note) | none | — | — | **idempotent no-op** (today THROWS — soften so a re-reject with no note doesn't error) |

Two rules that make the invariant survive re-decisions:
- **Edit applies on ANY transition into `approved`** (drop the first-draft's "only `pending_review→approved`" — that wording *was* the B2 bug).
- **`original_body` is write-once** (§B).

#### E. Curated positive exemplar (Channel 1)
- Replace the single hardcoded exemplar with a small **curated set** (2-3) of Magnus-approved pieces; one selected per **agent version**.
- **Rotation is per-agent-version, NOT per-session** (blocker fix — Technical Skeptic): production bakes the system prompt into the pinned Managed-Agent *agent resource* (`session-run.ts:100-109`); `buildSystemPrompt`/`assembleSystemPrompt` run only at agent create/update time in the CLI (`scripts/relay-session.ts:52`). So rotation happens at the **agent-update seam** (`ensureResources`), varying the exemplar each time voice is re-pushed. This still delivers *varied over time* — what the design memory wants — with no new per-session injection seam.
- **Curated, not auto-drawn.** Auto-draw would feed the agent its own greatest hits and **entrench its tics** — the opposite of "kill fixed tics via *varied* material." A human picks what counts as exemplary.
- **Mechanism:** a checked-in `exemplars` list (config, like `trusted-sources.ts`) referencing approved pieces. Assembly selects one deterministically (by agent-version index — no `Math.random` in scripts). Blindness-safe (approved pieces only).

#### F. Admin surface + findability
- Review tab renders, on decided pieces: the stored `review_note` and, when edited, an **"edited" indicator** with the original→edited delta visible (reuses 2.1 badge/`safeHref` patterns).
- **Has-signal findability (load-bearing for the 2.2b practice loop):** a **filter/badge on the existing approved + rejected sub-tabs** surfacing pieces where `review_note IS NOT NULL OR original_body IS NOT NULL`. Without it, Magnus can't find "everything I noted or edited" without opening every piece — which kills a periodic practice pass. Reuses the existing sub-tab + badge patterns; **no new route or component.** (Not a bespoke aggregate view — that would be gold-plating.)

#### G. Close the loop once, by hand (2.2a Definition of Done — forcing function)
2.2a is **not done** when the plumbing lands. Its DoD includes **one real hand-distillation pass**: read the captured notes/deltas via §F, author at least one genuine ✗/✓ anti-tell (or a curated-exemplar swap) into `craft-and-cadence.md`, and confirm it reaches the agent via the per-version exemplar/craft seam. This proves the taste loop *closes*, not just that capture works.

### Slice 2.2b — Automate the assist (after a corpus exists)
Consolidates **all LLM-over-captures machinery**, built once against real data:
- **The distiller:** an out-of-session agent reads the captured corpus, generalises **recurring** tells (not one-offs), and **proposes** ✗/✓ additions/retirements to the craft doc as a diff for Magnus to approve/commit. Never auto-commits.
- **The editor-agent** (Magnus's "human + editor-agent" intent, sequenced here): a cheap critique of a draft, shown **after** Magnus's own read as a second opinion (never before — preserves his read as the calibration loop). Advisory only; fail-safe (empty critique on LLM failure; never blocks the gate).
- **New column** `relay_pieces.editor_notes jsonb` and the **editor-agent LLM host** land here — a **new bridge-hosted primitive** (direct Anthropic/Claude call modelled on `grounded-search.ts` — the bridge has no Anthropic key and no single-shot inference primitive today; the only Claude usage is the heavyweight polled Managed-Agent session API, which is *not* cheap for a gate-side critique). Needs a new bridge secret + an `ExecutionContext`/`waitUntil` change to run async-on-`write_pending` off the agent's blocking path. Designed from evidence so it targets the class of tell the human eye actually misses, not a re-run of the writer's own craft doc.

### H. Gate-blindness guarantees (must hold)
- `review_note`, `original_body` (and 2.2b's `editor_notes`) are **never** read by `buildSystemPrompt`/`assembleSystemPrompt`/`recall`/`relay_recall`.
- **The blindness test is aimed at the real surface** (the first-draft version was vacuous — `assembleSystemPrompt` only ever sees 5 strings, never the DB). The **only** new session-side DB reader is the §E exemplar selector, so assert: (i) it filters `state='approved'` **and** selects **explicit columns, never `select('*')`** (load-bearing: `original_body` now sits on approved rows and a `*` select would pull it into assembly reach); (ii) `relay_recall` references none of the new columns. Add the `editor_notes` no-read assertion in 2.2b when that column lands.
- The curated exemplar draws from `state='approved'` pieces only — no outcome leakage.

## Data model changes (2.2a)
- `relay_pieces.review_note text` (nullable).
- `relay_pieces.original_body text` (nullable; write-once; non-null ⟹ edited-on-approval).
- **Two columns only.** `review_marks` dropped (fold into `review_note`); `editor_notes` deferred to 2.2b.
- One migration, applied via the Supabase SQL editor (not `db push`), consistent with prior relay migrations.

## Blast radius, cost, latency (2.2a)
- **Review path** gains two optional fields but keeps its shape (admin-gated, service-role). Low blast radius; the only behaviour change to existing code is softening `rejectPiece`'s re-reject throw to an idempotent no-op (§C).
- **No new secret, no new LLM call, no `waitUntil` change** in 2.2a — all of that is 2.2b.
- **Voice files:** the curated-exemplar change touches only the assembly/`ensureResources` seam; the persona docs stay authored.

## Open questions (remaining — smaller after review)
1. **Exemplar count & location:** 2 or 3 exemplars; do they live in the craft doc or a sibling `exemplars.ts` config? (Lean: sibling config, mirroring `trusted-sources.ts`.)
2. **Note editing on a *decided* piece:** the truth table persists a note *at decision time*; editing a note after the fact needs a separate small update route. 2.2a scopes notes as decision-moment (state it); add the path only if the practice pass demands it.
3. **Concurrency:** the collision the truth table resolves is two-tab/double-click (not cron-vs-session — Stage 1 is serial per A3). The existing single-tab `busyId` guard is the floor; a lost race returns a plain error, acceptable for a single-admin tool.

## Testing (2.2a)
- Review route accepts/validates `note` and `edited_body`; rejects oversized note / empty-whitespace edit.
- **The full truth table (§C)** as a test matrix: each `state × action × (note?/edit?)` row persists/no-ops/errors exactly as tabled — including already-approved+note (persist note, no embed), rejected+approve+edit (applies, resolves B2), and rejected+re-reject-no-note (idempotent no-op, the one behaviour change).
- `original_body` write-once: `edit → reject → re-approve-with-new-edit` leaves `original_body` = the *first* draft.
- Approve-with-edit embeds the *edited* body; plain approve (no edit) unchanged (regression).
- **Blindness (load-bearing, §H):** the §E exemplar selector filters `state='approved'` and selects explicit columns (never `select('*')`); `relay_recall` references none of the new columns.
- Curated exemplar: assembly selects one approved-piece exemplar deterministically by agent-version index; never a non-approved piece.
- Admin surface: decided piece shows stored note + edited/original delta; the has-signal filter surfaces exactly the pieces with `review_note` or `original_body` set.

## Rollout (2.2a)
1. Migration: `review_note`, `original_body` (2 columns) — Supabase SQL editor.
2. Bridge/API: `note` + `edited_body` through the review path; `approve/rejectPiece` per the truth table (incl. softening the re-reject throw).
3. Approve-with-edit UI + note field + edited/original rendering + the has-signal sub-tab filter.
4. Curated-exemplar config + the per-agent-version assembly change.
5. Live smoke: reject-with-reason, approve-with-edit (confirm `original_body` write-once + edited body embedded), confirm the has-signal filter finds them, confirm a re-pushed agent version carries a curated exemplar and carries **none** of the Channel-2 fields.
6. **Close the loop once by hand (DoD, §G):** author one real anti-tell / exemplar swap from actual captures.
7. Then 2.2b: the distiller + editor-agent + `editor_notes` column + the bridge Claude primitive.
