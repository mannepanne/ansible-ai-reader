# Relay — restraint and prose tuning (note)

**Status:** Draft note, not a stage spec
**Last updated:** 2026-09-06
**Related:** [stage-2-roadmap.md](./stage-2-roadmap.md), [stage-2.2-voice-editorial-loop-spec.md](./stage-2.2-voice-editorial-loop-spec.md), [stage-2.3c-gate-activity-log-spec.md](./stage-2.3c-gate-activity-log-spec.md), [14-prose-summary.md](../14-prose-summary.md), [13-fika-reading-habit.md](../13-fika-reading-habit.md)

---

## Two observed problems

1. **Relay fires too often.** It writes pieces when nothing is interesting enough to warrant one.
2. **The writing carries tells.** Mannered prose and the recognisable patterns catalogued in spec 14.

Both are tuning, not architecture. The machinery to fix each already exists or is already designed. This note sequences the work and says what to measure.

## Why this matters more once Fika lands

Fika (spec 13) is designed to raise the rating rate. The engagement gate reacts to rated and archived items, so more reading means more triggers. Relay's restraint has to be tuned for the higher rate that is coming, and the Fika email's planned "Relay wrote this" excerpt (slice 2) only works if what Relay writes is rare and good. Drift archiving must never wake the narrator; spec 13 specifies a `drift` skip reason in the gate.

## Restraint: measure, then tighten

There are two places a piece can be stopped, and they need separating before anything is changed:

| Brake | Where | Instrument |
|---|---|---|
| The engagement gate | `src/lib/relay/engagement-trigger.ts`, decides whether to wake the narrator at all | Activity log: gate pass versus not-reacted counts and reasons (Stage 2.3c) |
| The narrator's own restraint | Inside the session: WROTE versus DECLINED | Activity log: decision verdicts; the human gate's approve versus reject rate |

**Step 0.** Enable the engagement gate in the admin Relay tab so the activity log fills. Per the 2.3c notes it is default-off and enabling it baseline-stamps the backlog, so only items archived from that point trigger.

**Step 1, two to three weeks of data.** Read three numbers per week: gate passes, WROTE out of passes, approved out of WROTE. Set the target now so it is not fitted to the data: at most one approved piece per week, and a WROTE rate under a third of gate passes.

**Step 2, tighten the cheapest brake that moves the number.**
- If the gate passes too much: raise the bar. Require a 💡 rating plus either a note or a highlight, not any one of the three. A rating alone is a weak commission.
- If the narrator writes too much: this is the designed 2.2b work. The editorial design's cheap pre-write commission gate goes first: a separate small model call with no investment in a draft that answers "is there an argument here, and has it been said many times" with the freshness rubric from the editorial design memory, spike on 0 or 1. Only then the expensive post-draft editor.
- Do not use absolutist "never been said" wording in any gate. A fine piece can bring new force to a worn angle.

**Step 3.** Re-read the same three numbers for another two weeks. Stop when the target holds.

## Prose: adopt the shared guide and checker

Spec 14 creates `prose-style/plain-prose.md` and `src/lib/prose/tells.ts`. Relay adopts both:

1. Fold the "tells to cut" section of `relay-agent/ansible-agent-craft-and-cadence.md` into the shared guide, and have the craft doc reference it. One list, two consumers.
2. Add the new named patterns from spec 14 with Relay-specific examples where they exist in past drafts. The 2.2a piece-review capture is where those examples live.
3. Run the checker over each new piece in the review capture and show findings next to the piece in the admin tab. Advisory only at first, so we learn its false-positive rate on Relay's longer form before it can block anything.
4. Activate the voice change with a push-only session run. Editing the docs alone changes nothing the live agent does.
5. After ten pieces, compare checker findings with the human rejections. Patterns the human keeps rejecting that the checker misses go into the guide and the checker.

## Out of scope for this note

- The editor agent panel and distiller (2.2b proper), beyond the cheap pre-write gate above.
- The blog (2.4) and trigger automation (2.5).
- Any change to the gate-blindness guarantees. Ratings decide whether to react and never enter the prompt.

## Done when

- The activity log has been on for at least three weeks and the three weekly numbers are being read.
- The restraint target holds for two consecutive weeks.
- The shared guide is the single tells list and the checker runs on every captured piece.
