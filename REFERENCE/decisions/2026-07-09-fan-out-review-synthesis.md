# ADR: Reviewer agents fan out and report to an orchestrator; they do not debate each other

**Date:** 2026-07-09
**Status:** Active
**Supersedes:** N/A (the debate design was never recorded in an ADR — this ADR records its removal)

---

## Decision

Reviewer subagents spawned by `/review-spec`, `/review-pr`, and `/review-pr-team` run **independently and in parallel**. Each returns its findings to the orchestrating skill. The orchestrator — the main Claude session — synthesises all reports into one review, deduplicating findings and reconciling severity disagreements itself.

Reviewers do not message each other, do not broadcast findings, and do not negotiate a shared verdict. The multi-round discussion phase is removed.

## Context

The original design ran reviews in two phases: independent review, then a "collaborative discussion" in which reviewers shared findings via broadcast, challenged each other's severity ratings, and iterated to consensus.

In practice the discussion phase reliably ran long for diminishing returns. Two properties of the design made this near-inevitable:

1. **No termination condition.** The skills instructed the orchestrator to *monitor* the discussion and prod harder if it looked "too polite" (`review-pr-team/SKILL.md` Step 2: *"Encourage debate if the discussion is too polite"*). There was an accelerator and no brake. Consensus was the stated exit condition, but nothing bounded the number of rounds it took to get there, and reviewers with genuinely different specialisms often had no basis on which to converge.
2. **Debate is the wrong mechanism for the value it produced.** Auditing what the discussion phase actually contributed, essentially all of it was *severity recalibration when one reviewer lacked context another had* — the canonical case, baked into the skill's own output template, being Security rating an input handler 🔴 on the assumption the input was unvalidated, and the Architect knowing it was validated upstream.

That recalibration does not require agents to talk to each other. The orchestrator receives every report and can perform it directly.

## Alternatives considered

- **Keep debate, cap the rounds.** Add "at most two rounds of challenge, then stop."
  - Why not: it retains the whole messaging apparatus and its token cost for a bounded fraction of the same benefit, and round caps are notoriously soft in prompt-space — the model that was told to prod harder when reviewers were polite will find a reason for a third round. It buys less than it costs to specify.

- **Fan out, then one bounded adjudication round.** Reviewers report; where the orchestrator finds a conflict it can't settle from the reports, it sends one targeted follow-up question to one reviewer.
  - Why not: it re-opens the loop for the case that matters least. An unresolved conflict between two specialists is itself a valuable result — it means the human should look. Sending one more question mostly produces a confidently-worded answer that papers over the disagreement. Rejected to keep the control flow strictly acyclic.

- **Chosen: pure fan-out, orchestrator synthesises.** Reviewers report and stop. The orchestrator dedupes by `file:line`, reconciles severity using evidence present in the reports, and where the reports don't settle a disagreement, records both positions rather than manufacturing consensus.

## Reasoning

**Parallelism is preserved, the tail is removed.** Multiple `Agent` calls issued in one message already run concurrently, so the research phase costs the same wall-clock as before. Only the debate tail is cut. This is a strict improvement, not a speed-for-quality trade.

**The orchestrator is better positioned to reconcile than any individual reviewer.** It sees all reports simultaneously. A reviewer in a debate sees other reviewers' claims serially, through the narrow channel of what they chose to broadcast, and is subject to anchoring on whoever spoke first.

**Independence is a feature, not a cost.** Because reviewers never see each other's findings, two of them independently flagging the same `file:line` is a genuinely strong signal — uncorrelated observations. Under the debate design, agreement was partly an artefact of persuasion. Fan-out makes corroboration mean something.

**What is actually lost.** One thing: a reviewer re-examining code *because a peer prompted it*. A security specialist who reads the architect's finding might go back and look at a file it had skipped. This is real, and it is precisely the diminishing-returns tail — it fires rarely, cannot be predicted, and cost an unbounded discussion phase on every review to capture.

## Trade-offs accepted

**Some cross-checking now depends on orchestrator diligence.**
- The synthesis step must actually dedupe and reconcile rather than concatenating reports.
- Mitigated by making the reconciliation rules explicit in each skill (Step 2 of `review-pr-team`, Step 3 of `review-spec`) and by requiring every finding to carry `file:line` + severity + one-line evidence (the findings contract in [`.claude/agents/CLAUDE.md`](../../.claude/agents/CLAUDE.md#findings-contract)) so matching is mechanical.
- Accepted: the failure mode is visible. A synthesis that reads like four stapled documents is obvious to the human reading it, in a way that a debate quietly converging on a wrong consensus is not.

**Reviewers can no longer ask each other for information.**
- A reviewer that needs a judgement outside its specialism must say so rather than resolve it.
- Accepted, and turned into an explicit instruction: each agent is told to state the assumptions a rating depends on. An assumption stated in one report is exactly what another report may discharge. This makes the reports *more* useful than the pre-debate reports were.

**Unresolved disagreements now surface to the human instead of being settled by the agents.**
- Accepted deliberately. This is the intended behaviour, not a regression. The human is the decision-maker; a documented split between two specialists is higher-fidelity information than a consensus reached by whichever agent argued longer.

## Implications

**Enables:**
- Materially lower token cost and wall-clock time per team review, with no reduction in reviewer coverage
- Meaningful corroboration signal (independent agreement) and meaningful dissent signal (recorded splits)
- Simpler skills: no team creation, no monitoring loop, no teammate shutdown, no session-resumption caveats
- Reviewer agents become plain fan-out subagents, reusable in any orchestration without a teams feature flag

**Prevents / complicates:**
- No mechanism for a reviewer to request information from another reviewer mid-review. If a future review genuinely needs this, it should be a new ADR, not a quiet reintroduction of the discussion phase.
- The synthesis quality is now a property of the orchestrating model. A weaker orchestrator will produce a weaker review than the same agents under debate would have.

**Removed as a consequence:**
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` in `.claude/settings.json` — no longer needed by any skill
- The `## Team Collaboration` section from all seven reviewer agent definitions, replaced by `## Reporting to the orchestrator`
- The team-creation, team-monitoring, and team-cleanup steps from `/review-pr-team` and `/review-spec`

---

## References

- Related ADRs:
  - [2026-04-22 — Tiered PR review via a triage dispatcher](./2026-04-22-tiered-pr-review-dispatcher.md) — the tier structure this preserves; only the team tier's internals change
  - [2026-04-25 — PR review system assumes a solo trusted contributor](./2026-04-25-pr-review-threat-model.md) — severity calibration, which the orchestrator now applies during reconciliation
- Implementation: [`.claude/skills/review-pr-team/SKILL.md`](../../.claude/skills/review-pr-team/SKILL.md), [`.claude/skills/review-spec/SKILL.md`](../../.claude/skills/review-spec/SKILL.md)
- Shared contracts: [`.claude/agents/CLAUDE.md`](../../.claude/agents/CLAUDE.md) — orchestration model and findings contract
- Operations reference: [`REFERENCE/development/pr-review-workflow.md`](../development/pr-review-workflow.md)
