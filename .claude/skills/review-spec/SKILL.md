---
name: review-spec
description: Spec review using three independent reviewers — requirements auditor, technical skeptic, and devil's advocate — who each challenge a feature specification before implementation begins. Their findings are synthesised into a single assessment. Use this skill whenever a new feature spec or significant design decision needs review before writing code.
disable-model-invocation: false
user-invocable: true
argument-hint:
  - spec-file-path-or-name
---

# Spec Review

This skill reviews a feature specification before implementation begins, through three specialist lenses. Each reviewer analyses the spec independently, with no knowledge of what the others found. You — the orchestrator — receive all three reports and synthesise them into one assessment.

## The three reviewers

- **Requirements Auditor** — completeness: edge cases, error states, undefined behaviour, missing flows
- **Technical Skeptic** — feasibility: DB implications, blast radius, hidden complexity, integration risks
- **Devil's Advocate** — strategy: is this the right solution? Simpler alternatives? Wrong assumptions?

## How this works

**Phase 1: Independent review (parallel)** — all three analyse the spec simultaneously and do not communicate with each other.

**Phase 2: Synthesis (you)** — you hold all three reports at once, reconcile them, and produce a single recommendation.

**Why the reviewers don't talk to each other.** They used to. The discussion phase reliably ran long for little gain, and the cross-checking it produced is something you can do directly from the reports. See [`REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md`](../../../REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md).

---

## Instructions for Claude

When this skill is invoked with a spec file path or name (e.g., `/review-spec SPECIFICATIONS/07-new-feature.md`):

### Step 0: Review-mode gate

Run the gate defined in [`.claude/skills/review-gate.md`](../review-gate.md) → "Gate logic". When rendering the disabled message, substitute this skill's name: `review-spec`. If the gate tells you to stop, stop. If it tells you to proceed, continue to Step 1.

### Step 1: Locate the spec

Resolve the spec file:
- If `$ARGUMENTS` is a full path, use it directly
- If it's a partial name, search `SPECIFICATIONS/` for a matching file using the `Glob` tool with pattern `SPECIFICATIONS/*$ARGUMENTS*` and (if nothing matches) `SPECIFICATIONS/**/*$ARGUMENTS*`. Filter out any path containing `/ARCHIVE/` from the results.
- If ambiguous, ask the user to clarify

Use `Glob`, not `find`, so the resolution stays silent — `find` against arbitrary paths prompts; `Glob` doesn't. Confirm the spec file exists and read the first 50 lines with the `Read` tool to understand its scope before proceeding.

---

### Step 2: Spawn the three reviewers in parallel

**Issue all three `Agent` calls in a single message** so they run concurrently. Do not spawn them one at a time and do not wait for one before starting the next.

**Do not spawn these with `isolation: "worktree"`** — unlike the PR-review skills, which do. Spec reviewers read a spec file that lives in the operator's working tree, on the branch the operator is on; a worktree would isolate them from the very file under review, and possibly from an unstaged spec that isn't committed anywhere yet. There is no PR branch here and therefore no `gh pr checkout` temptation. The [read-only contract](../../agents/CLAUDE.md#read-only-contract) covers these agents on its own. Do not "harmonise" this with the PR skills — the asymmetry is the design.

Each reviewer's checklist, context-gathering protocol, and output format live in its agent definition. Do not restate them in the task prompt — a prompt that duplicates the agent definition will drift from it.

| Subagent | Task prompt |
|---|---|
| `requirements-auditor` | `Requirements-focused review of the spec at <resolved path>. Follow your agent definition. Return your findings.` |
| `technical-skeptic` | `Technical feasibility review of the spec at <resolved path>. Follow your agent definition. Return your findings.` |
| `devils-advocate` | `Strategic challenge review of the spec at <resolved path>. Follow your agent definition. Return your findings.` |

Pass the **resolved path** from Step 1, not the raw `$ARGUMENTS` — the reviewers should not have to repeat the glob resolution.

Tell the user this is running and roughly how long it takes (~2–4 minutes). Then wait for all three to return.

**If a reviewer fails or returns nothing:** synthesise from the reports you have and state plainly which perspective is missing. Do not silently review with two, and do not re-spawn it.

---

### Step 3: Synthesise the reports

This step is the review — do it properly rather than concatenating three documents.

**3a. Deduplicate.** Group findings that name the same spec section or the same underlying concern. Three reviewers circling one ambiguity is one finding, not three.

**3b. Reconcile.** The three lenses interact in predictable ways. Look for these pairings explicitly:

- **Devil's Advocate proposes a simpler alternative → does the Technical Skeptic's report say it's actually simpler?** An alternative that's strategically appealing but technically harder is not an improvement. If the Skeptic costed it, use that. If nobody costed it, say so — an uncosted alternative is a question, not a recommendation.
- **Requirements Auditor finds a gap → does the Technical Skeptic say filling it is expensive?** A cheap gap is a spec edit. An expensive gap is a scope decision the human makes.
- **Devil's Advocate challenges an assumption the Requirements Auditor flagged as unstated.** Two reviewers landing on the same assumption from different directions is the strongest signal in the whole review. Promote it.
- **If the reports do not settle a disagreement, record both positions and let the human decide.** Do not go back to the agents for another round. An unresolved tension between "this is the wrong approach" and "this approach is perfectly buildable" is genuine information — both can be true.

**3c. Do not invent findings.** Every item traces to at least one reviewer's report. If you spot something none of them did, mark it clearly as your own observation rather than attributing it to a reviewer.

**3d. Produce the assessment:**

```markdown
## Spec Review: [Spec Title]

> Reviewed independently by: Requirements Auditor, Technical Skeptic, Devil's Advocate.
> Findings deduplicated and reconciled into the assessment below.

---

### 📋 Overall Recommendation

**[APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION]**

[2-3 sentence summary of the overall assessment]

---

### 🔴 Blocking Issues — Must Resolve Before Implementation

[Issues serious enough that starting implementation would likely cause significant rework or build the wrong thing]

**Format per issue:**
**Issue:** [Description]
- **Raised by:** [which reviewer(s)]
- **Why blocking:** [specific impact if ignored]
- **Resolution needed:** [what the spec needs to say to unblock this]

---

### ⚠️ Conditions — Address Before or During Implementation

[Real concerns that need mitigation but don't require spec rewrite]

**Format per condition:**
**Condition:** [Description]
- **Raised by:** [which reviewer(s)]
- **Risk if ignored:** [specific consequence]
- **Suggested approach:** [how to address it]

---

### ✅ Well-Specified Areas

[Parts of the spec found clear, complete, and well-reasoned]

---

### 💡 Suggestions and Alternatives

[Improvements, scoping changes, or alternative approaches worth considering]

For each alternative, say whether its feasibility was assessed:
- **Alternative:** [description] — *proposed by Devil's Advocate; Technical Skeptic costed it as [simpler / harder / not assessed]*

---

### ⚖️ Where the Perspectives Diverged

[Findings where reviewers reached different conclusions — the most decision-relevant part of the review]

**Format:**
**[Topic]** — Requirements Auditor said X; Devil's Advocate said Y.
- **Reconciled to:** [your call, with the evidence from the reports that settles it]

*or*

- **Unresolved:** [why neither report settles it, and what would]

---

### 📊 Review Summary

**Requirements Auditor:** [X blocking gaps, Y incomplete areas, Z assumptions to validate]
**Technical Skeptic:** [X blocking risks, Y technical concerns, Z hidden complexity items]
**Devil's Advocate:** [X fundamental challenges, Y questionable assumptions, Z alternatives proposed]

**Findings corroborated by 2+ reviewers:** X
**Divergences reconciled during synthesis:** Y
**Divergences left unresolved (flagged above):** Z

**Recommendation:** [APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION]
```

Present this synthesis directly in the conversation — do **not** post to a PR or write to a file unless the user asks.

---

## Example usage

```
/review-spec SPECIFICATIONS/08-bulk-archive.md
/review-spec 08-bulk-archive
/review-spec interest-signals
```

Expected time: 2–4 minutes depending on spec size.

---

## Recommendation guide

**APPROVED** — Spec is complete, feasible, and solving the right problem. Proceed with implementation.

**APPROVED WITH CONDITIONS** — Spec is substantially good but has specific gaps or risks that need addressing. Implementation can begin once conditions are met (or with awareness of the risks noted).

**NEEDS REVISION** — Spec has blocking issues: incomplete requirements that would cause rework, a technical approach that won't work as described, or a strategic direction that needs reconsideration. Revise before starting implementation.

---

## Tips

- **Run before starting any non-trivial feature** — the earlier issues are caught, the cheaper they are to fix
- **Read the divergences section first** — where the three lenses disagree is where your judgement is actually needed
- **APPROVED WITH CONDITIONS is the most common outcome** — specs almost always have something worth clarifying
- **Use findings to improve the spec** — after review, update the spec to address the issues before archiving it
