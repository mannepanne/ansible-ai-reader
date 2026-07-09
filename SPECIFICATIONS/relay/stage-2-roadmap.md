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
**⏳ Outstanding (2.2a DoD §G — the loop is not yet proven closed):** once real reject-reasons/edits accumulate, do **one** hand-distillation pass — read the captured signal (admin ✎ filter) and author at least one genuine ✗/✓ anti-tell (or an exemplar swap) into `craft-and-cadence.md` / `exemplars.ts`. Until then 2.2a is *capture machinery merged*, not *the system demonstrably learning taste*. This can't be done in code (needs live captures); it must not evaporate.
**Goal:** the writing reads like a thinking entity; the system learns your taste.
**In scope (machinery, build once):** a phrase-level **"red pen"** (highlight AI-tells / weak lines, like an editor before a rewrite); **remember rejections & edits as anti-examples** (closing today's gap where a reject is forgotten and its embedding cleared); optionally an **editor-agent pass** that critiques before you see it ([[relay-agent-editorial-design]]).
**In scope (continuous discipline):** curated runs + approvals so recall + restraint mature; subtractive voice-tuning (minimal coda; concrete-true-detail over metaphor; kill fixed tics via varied material — spike findings). The engagement signals from 2.3 also feed taste here.
**Depends on:** 2.1 (grounded pieces are worth refining); continuous thereafter.
**Open questions:** red-pen human vs agent-assisted; how phrase signals feed back (prompt / corpus / style few-shot from approved exemplars); a recallable "why rejected".

### Phase 2.3 — The engine: archive-hook + rich stimulus (decide early, build here)
**Goal:** settle *how a reaction is triggered* — **decided: the archive-hook**, reacting to your engagement record, not the bare archive.
**In scope:** the **event-driven trigger** (the north-star's webhook) fired on archive; a **rich stimulus** assembled from the full engagement record — summary, Perplexity tags, whether you generated commentary, whether you clicked through to Reader, your **Reader highlights**, your Ansible note, and the **light-bulb / meh** signals (Ansible already logs interest-signals; Readwise holds highlights); an **engagement filter** so low-signal archives (the meh, the batch headline-dumps) don't trigger a reaction; **batch-archive handling** (debounce several archives in quick succession; evaluate each on its own signals). Triggered reactions still land in the human gate.
**Note:** the *decision* (archive-hook) is made now because it shapes how the corpus accumulates in 2.2; the *build* is this phase.
**Depends on:** decision independent; build benefits from 2.2's corpus + 2.1's grounding.
**Open questions:** archive-hook transport (Readwise webhook vs polling archived items); the engagement→react threshold; dedup; how much a triggered reaction differs from a manual one; **cross-cut** — when several *engaged-with, related* items are archived together (the north-star's "one newly archived article, or a few"), does Relay braid them into one piece? The spike's cross-cut was its single best output — but less sharp than the best standalones (a breadth-vs-sharpness trade-off), so the mature system should *choose* between deep-single and braided.

### Phase 2.4 — The blog (echoreflex.me), password-gated
**Goal:** the output surface — anonymous, sparse, static, **password-gated first** ([[relay-agent-guardrails]]).
**In scope:** backfills from the approved corpus in one deploy; the agent stays blind to it; the invisible password gate. Orthogonal to the mind — low-risk.
**Depends on:** enough approved pieces worth showing (2.1–2.2 maturing).
**Open questions:** hosting/design; the situations-not-people presentation; when the password comes off.

### Phase 2.5 — Automation (trigger-automation) → the on-ramp to Stage 3
**Goal:** reactions run without a click — the archive-hook operating unattended, still landing in the gate.
**Depends on:** 2.1 (unattended writing is trustworthy), 2.2 (restraint mature enough to be selective), 2.3 (the trigger exists), 2.4 (somewhere to publish).
**Open questions:** volume/cost at scale; the first honest look at *relaxing the gate* (distinct from removing the click — likely a Stage-3 decision).

## Stage 3 — the frontier & autonomy (horizon, not dropped)

The north-star's deepest and most dangerous machinery, parked until the corpus is mature: **concept rollups** + the **timer-driven consolidation clock** + the **standing reading** of admired voices (the second clock); the **frontier of attention** (propose → promote → merge/demote → prune, hot-eyes-in-session/cool-hands-on-the-schedule) with its **mandatory steelman gate** and **structural discriminator** (the anti-radicalisation guards); and the honest question of if/when the **human gate** relaxes. These are Stage 3 because they only become meaningful — and only become safe — once Stage 2's grounding, corpus, and taste loop exist.
