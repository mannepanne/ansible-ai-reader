# Relay — Stage 3 Outline: the frontier & autonomy

**Status:** OUTLINE — what we know today, so the continuation after Stage 2 is legible. To be enriched, then `/review-spec`'d, when we reach it. Not a build spec yet.
**North star:** [ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md](../ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md) — Stage 3 is where most of its deepest machinery finally lands.
**Depends on:** all of Stage 2 ([stage-2-roadmap.md](./stage-2-roadmap.md)).

## What Stage 3 is

The first stage where Relay stops merely *reacting to what you put in front of it* and starts **accumulating understanding** and **managing its own attention** over time — and eventually running unattended. It's the north-star's most powerful machinery, and its most dangerous. It is only *meaningful* once a real corpus exists (Stage 2), and only *safe* once grounding, taste, and the guardrails are proven (Stage 2). That ordering is not negotiable.

## The defining risk — read this first

The memory-system spec is blunt: *"an agent that expands what it attacks, feeds its own output back as memory, and reads mostly the voices it admires is the standard recipe for radicalisation."* Everything before Stage 3 is Relay reacting to a human's curation. The frontier lets it choose what to *hunt*. So the **safety machinery is the spine of this stage, not a feature of it** — the mandatory steelman gate, the structural discriminator, the balanced reading (no echo chamber), the narrator's standing self-doubt, and the operator's visible window. If any of those is weak, Stage 3 should not ship.

## Components

### 3.1 Foundation depth — rollups & the consolidation clock (the second clock)
Stage 2's trigger is the **event clock** (the archive-hook). Stage 3 adds the **timer clock**:
- **Concept rollups** — the *seat of understanding*: a synthesis per standing concern of what Relay has come to grasp across everything it has written and read, *including how that grasp has moved*. A map that orients before it goes down into the territory — authored in its own understanding-voice, but **derived and regenerated from the pieces on the scheduled run, never edited in place, never monumentalised**. The deepest are cross-cutting (e.g. *capture, then extract* under both enshittification and the AI land-grab). Regeneration is also the only honest "forgetting": nothing lost, only restated more compactly as it settles.
- **The consolidation run** (low-frequency, timer-driven): regenerate rollups, tidy the index, and do the **standing reading** — pull the *admired voices'* recent work into the reference archive on a cadence, so Relay is *always already reading* the minds it trusts instead of summoning them mid-argument.

### 3.2 The frontier of attention (the centrepiece)
The **watched-systems list manages itself** — grows and contracts as Relay recognises new instances of the patterns it hunts. Built to manage *down* as much as up. Four moves:
- **Propose** — in-session, when a stimulus is both adjacent in the index to an existing concern *and* recognised as a real instance of a values-pattern, log a **candidate** (not a member) with its evidence. Geometry proposes; the values-judgment is the agent's.
- **Promote** — on the scheduled run only, a candidate that has recurred across several stimuli with real evidence may become a watched concern. **Never on a single piece, never in the heat of writing** — hot eyes in the session, cool hands on the schedule.
- **Merge & demote** — concerns that prove to be one pattern fold into a shared cross-cutting rollup; a concern that stops yielding live instances goes dormant (out of the spotlight, never deleted).
- **Prune** — a soft cap + use-it-or-lose-it decay hold the active list to a person's handful of real preoccupations, not an ever-growing ledger.

**Two mandatory gates (not advisory):**
- **The steelman gate** — before promotion, research the strongest opposing case; promote only if a genuine power-on-the-ground injustice survives it. A concern the best counter-argument dissolves was grievance, and is dropped.
- **The structural discriminator** — candidacy needs a recognised pattern weighed by *power on the ground*, never the volume of offence.

The list stays **structural** — systems, roles, patterns ("the concentration of media ownership"), never people (people appear only as evidence inside a concern, under the trunk's naming rules). And it keeps a **visible change-record** of every promote/merge/demote with its reason — the rings made legible, and the operator's window to step in.

### 3.3 Full autonomy & the human-gate question
Stage 2.5 removes the *click* (trigger-automation, still gated). Stage 3 faces the harder question: **if/when the human review gate relaxes.** The honest default is that it may *never fully* come off for an art project carrying these risks — or relaxes only gradually, with the change-record and the frontier's visible log as the monitoring surface. What would have to be true (grounding proven, restraint mature, the frontier's gates trusted) is itself a decision this stage's spec must settle, not assume.

## Carried guardrails (the north-star's "what not to build")
No prediction/forecasting; no threads as tracked objects (continuity stays associative; a rollup is *consulted, not advanced*); no audience/engagement tracking; no simulated-fallible memory (the record is perfect; the only "forgetting" is narrowing what's foregrounded); **no echo chamber** (admired voices sharpen, always balanced by the opposing and unaffiliated; fact-sources trusted for accuracy, not for taking Relay's side); **no grievance engine** (the frontier grows on pattern + power, never offence — the steelman gate is mandatory).

## Dependencies on Stage 2
- **2.1 grounding** → the steelman gate and the three-kinds research are the frontier's promotion machinery.
- **2.2 corpus + taste** → rollups and "have I said this" restraint need an accreted self-corpus.
- **2.3 engine + engagement signals** → the event clock; the frontier's "propose" fires in-session.
- **2.4 blog** → a place for autonomous output to land.
- **2.5 trigger-automation** → the on-ramp; Stage 3 is the destination.

## Open questions (to resolve at kickoff)
- Where candidates + the frontier change-record live; the exact promote/demote/prune thresholds.
- Rollup regeneration cadence + cost; how a rollup is surfaced in-session without being treated as a stored verdict.
- Which feeds the standing reading pulls for the admired voices, and how often.
- The gate-relaxation criteria — the single most consequential decision in the project, and the one most likely to stay "not yet."
- Cost posture at autonomous volume (the north-star says cost is not a constraint at this scale — revisit under real load).
