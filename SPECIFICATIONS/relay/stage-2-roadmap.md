# Relay — Stage 2 Roadmap: making it come alive

**Status:** Planning / agreed sequence (2026-07-09)
**North star:** [ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md](../ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md) — the conceptual memory-system spec. This roadmap sequences toward it; nothing in it is abandoned, only staged.
**Per-phase specs:** each phase gets its own detailed spec + `/review-spec` at kickoff. This doc is the *sequence and the why*, not the *how*.

## Numbering

- **Stage 0** — voice spike (done): the persona produces the voice.
- **Stage 1** — the mechanical engine (done): stimulus → rented mind → recall → write-or-silence → decision captured → human gate → approval makes it recallable. Runs reliably on the orchestrator DO; the 9-stimulus acceptance passed.
- **Stage 2** — *making it come alive* (this document): Phases 1–5.
- **Stage 3** — the frontier & autonomy: the north-star's most powerful and most dangerous machinery (the self-managing watched-systems frontier, full autonomy). Parked here on purpose, not dropped.

## Guiding principles (carried forward, incl. the north-star's "what not to build")

- **Voice is the whole project.** It lives or dies on how the writing reads. Voice work is a spine through every phase.
- **Fact-grounding gates autonomy.** Relay reacts to a *summary of the world*, not the world, and asserts unverified specifics (the spike's #1 gap). Nothing unattended is trustworthy until this exists.
- **The human gate stays on** through all of Stage 2. "Automation" removes your *finger from the trigger*, not your *eyes from the output* — two separate unlockings; the second waits.
- **Restraint & variety come from memory + material, not prompt** (spike-proven). The corpus growing is what makes the writing selective and un-generative.
- **The north-star's prohibitions hold:** no prediction/forecasting; no threads as tracked objects; no audience/engagement tracking; no simulated-fallible memory; **no echo chamber** (admired voices are for sharpening, always balanced by the opposing and unaffiliated); **no grievance engine** (the frontier grows on recognised pattern + power-on-the-ground, never offence — the steelman gate is mandatory).

## North-star map — where every big idea lands

| Memory-system spec idea | Status / phase |
|---|---|
| Corpus of record (self + reference), frontmatter, vector index (the mind palace), the session loop, the bridge | ✅ **Built (Stage 1)** |
| Outward research in three kinds (fact-finding · admired voices · other-voices/steelman) | **2.1** |
| The lists as editable state — trusted fact-sources, admired voices | **2.1** (seeded); watched-systems → 3 |
| Verification + naming/legal hygiene | **2.1** |
| Consolidation: ingest worthwhile found sources as new reference | **2.1** |
| Voice sharpening over time; remember rejections/edits (editorial loop) | **2.2** |
| Rich stimulus from engagement signals *(our addition — see 2.3)* | **2.3** |
| Event-driven trigger (the webhook) → the archive-hook | **2.3** |
| Publish target — the blog | **2.4** |
| Concept rollups (the seat of understanding); the timer-driven consolidation clock; the standing reading of admired voices | **Stage 3** (Foundation depth; may pull earlier) |
| The frontier of attention (propose/promote/merge/prune) + steelman gate + structural discriminator | **Stage 3** |
| Full autonomy / relaxing the human gate | **Stage 3** |
| Three layers (Identity / Foundation / Working) | Framing: Identity + Working built; Foundation grows through Stages 2–3 |

## Stage 2 — the phases

### Phase 2.1 — Fact-grounding & outward research (the biggest lever)
**Spec:** [stage-2.1-fact-grounding-spec.md](./stage-2.1-fact-grounding-spec.md) — `/review-spec`'d (2026-07-09), revised to buildable.
**Goal:** Relay gathers **verbatim, source-attributable facts** before it writes (reduces *fabrication*; the automated *verification* pass is a deferred follow-on).
**In scope (per the reviewed spec):** a live agent-facing **`research`** tool returning quoted snippets + source (fact-finding only — `opposition` dropped since the commentariat already supplies a counter-view); re-enable `ingest_reference` (+ the `fetchById` origin-fix + dedup); a **seeded trusted-source config** (not a table); backend-derived honest `verification_status` (`sourced`, never `grounded`); provenance on pieces (`links`) and **on decisions incl. declines** (`relay_decisions.sources`); the admin-tab grounding surface; prompt-level hygiene.
**Deferred to Stage 3** (per review): the admired-voices list + standing reading; the editable/growing list table; the structural anti-echo (steelman) guarantee.
**Depends on:** nothing — start here.
**Open questions (remaining):** the MA per-tool-call timeout; the per-session research cap; conflicting-sources handling.

### Phase 2.2 — Voice & the editorial/taste loop (the spine)
**Spec:** [stage-2.2-voice-editorial-loop-spec.md](./stage-2.2-voice-editorial-loop-spec.md) — `/review-spec`'d (2026-07-09, APPROVED WITH CONDITIONS). Sliced: **2.2a** (capture the why + the fix + findability + curated exemplar) **IMPLEMENTED**; **2.2b** (editor-agent + distiller) deferred until a captured corpus exists.
**2.2a DoD §G — taste loop CLOSED end-to-end on real data (the process, exercised once by hand).** The full chain ran: a genuine capture (an approve-with-note on the `debottlenecking` piece flagging *"Watch the order of operations, because it gives the game away."* as an AI tell) → human distilled it into a new **"The knowing nudge"** ✗/✓ anti-tell in `craft-and-cadence.md` (PR #128, merged) → the assembled prompt was re-pushed to the pinned agent (`npm run relay:session` reported *"agent voice updated → version 7"*) → a live run produced a fresh piece. **That closed process is the durable win** — capture works, distillation reaches the live agent.
**What the single live run does and does not prove.** The run (stimulus *"Why is Meta destroying its engineering organization?"* → piece "Show your work", verdict WROTE) did **not** emit the flagged nudge; its reveals are stated as flat declaratives, with a couple of mild soft-echoes remaining. But this is **weak confirmatory evidence, not proof the edit works**: it is one uncontrolled run (no A/B against the pre-edit prompt), and this stimulus is surveillance/appropriation-shaped, not the stated-reason-vs-real-reason structure that bred the nudge — so it may not have tempted the tell at all. Read it as *consistent-with*, never *causal*.
**Honest state of the capture corpus.** Signal is **thin** — before this run, 1 note across 18 pieces, and **0 edit-deltas** (`original_body` has never been written by real data → the edit-capture half of 2.2a is merged-but-unexercised). **Concrete next action:** the new "Show your work" piece sits in the gate; reviewing it (approve-with-edit or reject-with-note) is the chance to fire the never-exercised `original_body` / reject-note path and start thickening the Channel-2 signal that makes 2.2b (the automated distiller) worth building.
**Goal:** the writing reads like a thinking entity; the system learns your taste.
**In scope (machinery, build once):** a phrase-level **"red pen"** (highlight AI-tells / weak lines, like an editor before a rewrite); **remember rejections & edits as anti-examples** (closing today's gap where a reject is forgotten and its embedding cleared); optionally an **editor-agent pass** that critiques before you see it ([[relay-agent-editorial-design]]).
**In scope (continuous discipline):** curated runs + approvals so recall + restraint mature; subtractive voice-tuning (minimal coda; concrete-true-detail over metaphor; kill fixed tics via varied material — spike findings). The engagement signals from 2.3 also feed taste here.
**Depends on:** 2.1 (grounded pieces are worth refining); continuous thereafter.
**Open questions:** red-pen human vs agent-assisted; how phrase signals feed back (prompt / corpus / style few-shot from approved exemplars); a recallable "why rejected".

### Phase 2.3 — The engine: archive-hook + rich stimulus (decide early, build here)
**Goal:** settle *how a reaction is triggered* — **decided: the archive-hook**, reacting to your engagement record, not the bare archive. Reshaped after `/review-spec` into **two slices** — full detail: [stage-2.3-archive-hook-spec.md](./stage-2.3-archive-hook-spec.md).
**In scope (2.3a — rich stimulus, shipped):** enrich the stimulus with summary + Perplexity tags + your Ansible note + the counter-case (commentariat), on the existing manual trigger. Zero migration.
**In scope (2.3b — the engagement-gated hook, shipped):** a **poll-hook** on the archive-sync (the webhook was **decided against** — no real-time need); an **engagement filter** so only strong-signal archives react (a 💡 rating, a note, or **≥1 highlight by *count***; a 🤷 vetoes) while the meh and batch headline-dumps don't; **owner-scoping** (single-owner system — a non-owner's private engagement must never feed the narrator) and a **self-healing idempotency** marker (the real risk is a *missed* trigger, not a double). Adds 3 columns, no table. Triggered reactions still land in the human gate. Behind an admin **enable-toggle, default-off**.
**Dropped (§E):** the highlight-**text** sync-and-store — v3 highlights have no `parent_id` filter, so it's a full sync-and-store (table + backfill + rate-limiter contention) for a salience marker that's a subset of the article Relay already reads, and a soft cousin of the rating-bias §D designs out. Highlight **count** (free on the archive response) is the trigger signal; the text is not sourced.
**Note:** the *decision* (archive-hook) is made now because it shapes how the corpus accumulates in 2.2; the *build* is this phase.
**Depends on:** decision independent; build benefits from 2.2's corpus + 2.1's grounding.
**Open questions:** *(resolved for 2.3b, 2026-07-10 — see the [single-owner ADR](../../REFERENCE/decisions/2026-07-10-relay-single-owner-engagement-gate.md): enable-toggle = a default-off boolean on the owner's `users` row, admin-flippable; `RELAY_OWNER_USER_ID` = explicit env, not `is_admin`; the filter reads the live `reader_items.rating`, not `item_signals`.)* Still open: **cross-cut** — when several *engaged-with, related* items are archived together (the north-star's "one newly archived article, or a few"), does Relay braid them into one piece? Deferred (one session per item for now). The spike's cross-cut was its single best output — but less sharp than the best standalones (a breadth-vs-sharpness trade-off), so the mature system should *choose* between deep-single and braided.

### Phase 2.4 — The blog (echoreflex.me), password-gated
**Goal:** the output surface — anonymous, sparse, static, **password-gated first** ([[relay-agent-guardrails]]).
**In scope:** backfills from the approved corpus in one deploy; the agent stays blind to it; the invisible password gate. Orthogonal to the mind — low-risk.
**Locked requirement — the publish gate must be provenance-aware (decided 2026-07-09):** the concern is "no ungrounded claim goes out as fact." The publish step surfaces grounding status and lets a piece that **asserts an ungrounded specific** be held back — but **`unverified` ≠ unpublishable.** An `unverified` piece is one that attached no source link; a good *analytical* piece about a situation makes no checkable factual claim and is legitimately unverified and safe to publish. The discriminator is **claim-type (does it assert a checkable fact, and is it grounded?), NOT the `verification_status` label** — filtering on `sourced` would both block sound analysis and miss a fact-asserting piece that stapled on a weak link (`sourced` is the agent-supplied, weaker provenance signal; the honest "actually supported" upgrade is the Stage-3 re-verification pass). The human gate remains the primary check; this is the automated *assist* at publish time.
**Depends on:** enough approved pieces worth showing (2.1–2.2 maturing).
**Open questions:** hosting/design; the situations-not-people presentation; when the password comes off; how the provenance-aware hold is presented/enforced (advisory flag vs. hard hold).

### Phase 2.5 — Automation (trigger-automation) → the on-ramp to Stage 3
**Goal:** reactions run without a click — the archive-hook operating unattended, still landing in the gate.
**Depends on:** 2.1 (unattended writing is trustworthy), 2.2 (restraint mature enough to be selective), 2.3 (the trigger exists), 2.4 (somewhere to publish).
**Open questions:** volume/cost at scale; the first honest look at *relaxing the gate* (distinct from removing the click — likely a Stage-3 decision).

## Stage 3 — the frontier & autonomy (horizon, not dropped)

The north-star's deepest and most dangerous machinery, parked until the corpus is mature: **concept rollups** + the **timer-driven consolidation clock** + the **standing reading** of admired voices (the second clock); the **frontier of attention** (propose → promote → merge/demote → prune, hot-eyes-in-session/cool-hands-on-the-schedule) with its **mandatory steelman gate** and **structural discriminator** (the anti-radicalisation guards); and the honest question of if/when the **human gate** relaxes. These are Stage 3 because they only become meaningful — and only become safe — once Stage 2's grounding, corpus, and taste loop exist.
