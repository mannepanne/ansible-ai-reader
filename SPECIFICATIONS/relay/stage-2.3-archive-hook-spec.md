# Relay — Stage 2.3: The archive-hook engine + rich stimulus (spec)

**Status:** **DRAFT — awaiting `/review-spec`.** Four kickoff forks decided with Magnus (2026-07-10, see §"What's decided"). The one spec-blocking unknown (how to fetch highlight text from Readwise) was resolved by a live API probe before drafting — findings in §Design A. Builds on Stage 2.1 (grounding) + 2.2 (voice/taste). North star: `SPECIFICATIONS/ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md` ("A webhook starts the session. The stimulus is the thing on the desk — one newly archived article, or a few.").

## Problem

Relay reacts only to a **manual** trigger today: an operator opens the admin tab, types a `reader_id`, clicks run. The north-star wants Relay to react to **the thing on the desk** — an item you just archived in Readwise Reader — and specifically to react to your **engagement** with it, not the bare fact of archiving. Most archives are low-signal (batch headline-dumps cleared unread); those must **not** trigger a reaction. The reaction should be enriched by everything you did with the item: your highlights, your note, whether you found it interesting.

This phase turns the manual trigger into an **engagement-gated archive-hook**, and enriches the stimulus from the full engagement record. Triggered reactions still land in the **human gate** (Relay stays blind to the gate, per Stage 1/2.2).

## What's decided (the four forks, locked with Magnus)

1. **Trigger = poll-hook.** Reuse the existing archive-sync poll; **no webhook** (Readwise archive-webhook support is undocumented/sparse, and we already poll archived items on every sync). No real-time need — a gate-published narrator reacting within a sync interval is fine.
2. **Filter = strong signal required.** React only if the archived item has a **💡 interesting rating**, **a note**, or **≥1 highlight**. A bare click-through (or a generated commentariat) does **not** qualify as a trigger. A 🤷 not-interesting rating means skip.
3. **Highlights = full text, in scope.** Fetch and store the actual highlighted passages + inline annotations. This is the one genuinely new data sub-project (highlights are not in Ansible today).
4. **Batch = one session per item.** Each qualifying archive gets its own session (the orchestrator DO already serialises). Braiding/cross-cut of related items is **deferred** (open research question; needs relatedness detection + orchestrator changes).

## What already exists (hooks we build on)

- **Archive-sync poll:** `performSyncForUser()` (`src/lib/sync-operations.ts`) already calls `fetchRecentlyArchivedItems(apiToken, updatedAfter)` (`src/lib/reader-api.ts`) each sync and flips `reader_items.archived = true, archived_at = NOW()` on newly-archived items. **This is the transition point the hook hangs on.**
- **Engagement data:** `reader_items.short_summary` (auto AI summary), `commentariat_summary` (+`commentariat_generated_at`, on-demand), `tags[]`, `document_note` (synced to Reader). Interest signals in the append-only `item_signals` table — types `click_through`, `note_added`, `rated_interesting`, `rated_not_interesting`.
- **The trigger target:** the manual admin button posts to `src/app/api/admin/relay/run/route.ts`, which resolves the singleton `RelayOrchestrator` Durable Object (`idFromName('relay')`) and `fetch`es `/enqueue {readerId}`. The DO serialises runs (one in flight; T0-window attribution). **The archive-hook enqueues on this same DO** — no new orchestration.
- **Reader API client + token:** `src/lib/reader-api.ts` uses the v3 Reader API with `READER_API_TOKEN`. The probe (§Design A) confirmed this same token authenticates the highlight endpoints — no new secret.

## Goals (2.3 delivers)

- **G1.** A **highlights sync-and-store** pipeline: newly created/modified Reader highlights are pulled incrementally during sync and persisted locally, keyed to their parent document.
- **G2.** An **engagement filter** that classifies a newly-archived item as *worth a reaction* (strong signal) or *skip*.
- **G3.** A **poll-hook** that, on a qualifying archive transition, enqueues a Relay session on the existing DO — idempotently (at most once per archive).
- **G4.** A **rich stimulus**: the session's prompt is assembled from summary + tags + commentariat + note + **highlights** (not just title/summary/commentariat as today).
- **G5.** Gate-blindness preserved, and **rating-bias avoided** (see Design D).

## Non-goals (deferred)

- **Braiding / cross-cut** (one session per item this phase).
- **Full unattended always-on automation at scale** — that is **Phase 2.5**. The 2.3/2.5 boundary is an open question (§Open questions): 2.3 delivers the working mechanism, likely behind an operator **enable toggle / default-off**; 2.5 turns it fully on and hardens volume/cost.
- **Highlights as a first-class `item_signals` type** (the interest-signals Phase 2 / issue #58). We store highlights in a dedicated table; emitting a signal row too is optional and not required here.
- **A real Readwise webhook** (decided against; revisit only if real-time ever matters).

## Design

### A. Highlights sync-and-store (the new data sub-project)

**Live-probe findings (2026-07-10, verified against Magnus's real Readwise account, same `READER_API_TOKEN`, both APIs `200`):**

- **Use the v3 Reader API, not v2.** Highlights are **child documents**: `GET /api/v3/list/?category=highlight` returns highlight docs, each with **`parent_id`** = the parent article's Reader document id. **The highlighted text is in the `content` field**; the inline annotation is in `notes`. (Confirmed empirically: `content` len ~945 carried the real passage; `summary`/`html_content`/`text` were empty/absent.)
- **Cross-validated but not needed:** the v2 `/export/` path also works and confirms the mapping (`book.external_id == v3 parent_id == Reader doc id`, v2 `.text` ≈ v3 `.content`). We prefer v3: single API, single token, **id-native** (no client-side book join, no `external_id` assumption, avoids v2's "`updatedAfter` filters on highlight-mtime" gotcha).
- **Gotcha that shapes the architecture:** the v3 list has **no `parent_id` filter** (`?parent_id=` / `?parentId=` are ignored — count stayed 1041). So we cannot cheaply fetch *one document's* highlights on demand. → **Sync-and-store**, not fetch-on-demand.

**Mechanism:**
- **New client fn** `fetchHighlightChildren(apiToken, updatedAfter, pageCursor?)` in `reader-api.ts`: `GET /api/v3/list/?category=highlight&updatedAfter=<iso>&withHtmlContent=true`, paginating `nextPageCursor`. Rate limit is 20/min (v3 list); a full initial backfill (~1041 highlights ≈ 11 pages @ 100) fits inside one minute; incremental syncs are 1–2 pages.
- **New sync step** inside `performSyncForUser()`: incremental by a stored per-user highlight cursor (last `updatedAfter`); **upsert by highlight `id`** into a new table (idempotent — re-editing a highlight updates the row).
- **New table `reader_highlights`** (Ansible data, *not* `relay_*`): `(user_id, parent_reader_id, highlight_id UNIQUE, text, note, location, highlighted_at, created_at, updated_at)`. Keyed for lookup by `(user_id, parent_reader_id)`. We store highlights even when the parent document was never synced into `reader_items` (harmless; the hook only ever queries by an *archived* item's `reader_id`).

### B. The engagement filter (strong signal)

On a newly-archived item (see C), classify **react** vs **skip**:
- **💡 interesting** — the item's **latest** rating signal in `item_signals` is `rated_interesting` (append-only + toggles preserved, so read the most recent rating row for the item).
- **note** — `document_note` is non-empty (equivalently, a `note_added` signal exists).
- **highlight** — `reader_highlights` has ≥1 row for the item's `reader_id`.

**React iff ≥1 of the above AND the latest rating is not `rated_not_interesting`.** `click_through` and commentariat-generation never qualify as triggers (they may still *enrich* the stimulus, §D). The 🤷-veto-vs-highlight conflict is an open question (§Open questions) — proposed default: an explicit latest 🤷 vetoes (you said "not interesting," we respect it) even if highlights exist.

### C. The poll-hook (trigger)

- **Where:** in the archive-sync step, at the point a document transitions `archived: false → true`. On that transition, evaluate §B; if **react**, `fetch` the DO's `/enqueue {readerId}`.
- **Idempotency (at most once per archive):** add `reader_items.relay_triggered_at (timestamptz null)`. Enqueue only when it's null; stamp it on enqueue. This survives re-syncs and mid-sync crashes without double-triggering. (Re-archiving after an unarchive is an accepted edge — we can clear the stamp on unarchive if desired, deferred.)
- **Batch:** several qualifying items in one sync each enqueue; the DO runs them serially. No debounce needed (one-per-item decision).

### D. Rich stimulus assembly

- Enrich the orchestrator's fetch (today `src/lib/relay/orchestrator.ts` selects only `title, short_summary, commentariat_summary`) and `formatStimulus` (`session-run.ts`) to add **tags**, **document_note**, **commentariat**, and the item's **highlights** (`text` + `note`).
- **Gate-blindness + rating-bias (G5):** ratings (💡/🤷) are used **server-side for the filter only** and are **not** placed in the prompt — telling the agent "Magnus rated this interesting" risks biasing it toward writing (it would feel commissioned), undercutting the restraint the whole project depends on. The **content** signals do enrich the prompt: highlights (the passages that landed), the note (Magnus's marginal thought), tags, commentary. Whether even framing highlights as "passages the reader marked" leaks salient bias is flagged for review (§Open questions) — proposed: include them as neutral context ("marked passages"), since input salience ≠ an output verdict, and it genuinely sharpens the stimulus.

## Data model changes

- **New table `reader_highlights`** (see A). Migration + RLS consistent with `reader_items` (user-scoped).
- **New column `reader_items.relay_triggered_at timestamptz null`** (trigger idempotency).
- **Highlight sync cursor** per user — store last `updatedAfter` (reuse the existing sync-state mechanism used for archived-items polling, or a small column; align with how archive-sync persists its cursor).

## Blast radius, cost, latency

- **Sync gains a highlight step:** extra v3 calls, rate-limited and incremental (cheap after the one-time backfill). Failure must be non-fatal to the rest of sync (mirror archive-sync's "log to `sync_log.errors`, continue").
- **Trigger latency = sync interval** (acceptable; gate-published narrator).
- **DO serial:** many qualifying archives at once process sequentially (~5 min/session). Could back up under a big engaged batch; acceptable for now, noted for 2.5 scale work.
- **Reader-side writes:** none — highlights are read-only pulls.

## Open questions (for `/review-spec`)

1. **🤷 veto vs highlight** — does an explicit latest not-interesting override a highlight? (Proposed: yes, veto.)
2. **2.3/2.5 boundary** — is the hook on-by-default or behind an operator toggle this phase? (Proposed: toggle, default-off, so 2.3 is provably-working-but-opt-in; 2.5 flips it on + scale-hardens.)
3. **Rating-bias framing** — is including "marked passages" in the prompt safe, or does any engagement framing bias the agent? (Proposed: include highlights as neutral context; keep ratings out.)
4. **Highlight cursor storage** — reuse the archive-sync cursor mechanism vs a dedicated store?
5. **Initial backfill** — auto-paginate the ~1041 existing highlights on the first sync after deploy, or a one-off script? (Proposed: auto, bounded by rate limit.)
6. **Highlights on never-synced parents** — store anyway (proposed) vs skip.

## Testing

- `fetchHighlightChildren` — pagination + `updatedAfter` param assembly (mocked).
- Highlight **upsert idempotency** (re-sync same highlight → update, not duplicate).
- Filter logic — each strong signal independently; 🤷 veto; no-signal skip; click-through-only skip.
- **Trigger idempotency** — a re-detected archive does not double-enqueue (`relay_triggered_at` guard).
- Stimulus assembly — includes highlights/note/tags/commentary; **excludes ratings** (blindness/bias test, analogous to the 2.2a Channel-2 blindness test).
- Sync-step failure is non-fatal to the rest of sync.

## Rollout

- Migration (`reader_highlights` + `relay_triggered_at` + cursor).
- Deploy; first sync auto-runs the highlight backfill (rate-limited).
- Enable the hook (toggle per Open Q2); watch the first qualifying archive flow through to a pending piece in the gate.
