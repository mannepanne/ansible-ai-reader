---
name: review-spec
description: Spec review using agent teams — requirements auditor, technical skeptic, and devil's advocate challenge a feature specification before implementation begins. Use this skill whenever a new feature spec or significant design decision needs review before writing code. Agents debate and challenge each other's findings to surface blind spots and gaps.
disable-model-invocation: false
user-invocable: true
argument-hint:
  - spec-file-path-or-name
---

# Spec Review with Agent Teams

This skill reviews a feature specification before implementation begins, using three specialized reviewers who independently analyze the spec, then **discuss findings, debate assumptions, and challenge each other** to reach a collaborative assessment.

## The Three Reviewers

- **Requirements Auditor** — completeness: edge cases, error states, undefined behaviour, missing flows
- **Technical Skeptic** — feasibility: DB implications, blast radius, hidden complexity, integration risks
- **Devil's Advocate** — strategy: is this the right solution? Simpler alternatives? Wrong assumptions?

## How This Works

**Phase 1: Independent Review** — all three reviewers analyze the spec simultaneously from their own perspective

**Phase 2: Collaborative Discussion** — reviewers share findings, challenge each other's conclusions, and debate severity

**Phase 3: Synthesis** — produce a unified assessment with a clear recommendation

---

## Prerequisites

Agent teams require the feature flag to be enabled in `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

---

## Instructions for Claude

When this skill is invoked with a spec file path or name (e.g., `/review-spec SPECIFICATIONS/07-new-feature.md`):

### Step 1: Locate the Spec

Resolve the spec file:
- If `$ARGUMENTS` is a full path, use it directly
- If it's a partial name, search `SPECIFICATIONS/` for a matching file:
  ```bash
  find SPECIFICATIONS/ -name "*$ARGUMENTS*" -not -path "*/ARCHIVE/*"
  ```
- If ambiguous, ask the user to clarify

Confirm the spec file exists and read the first 50 lines to understand its scope before proceeding.

---

### Step 2: Create Agent Team

**CRITICAL:** Create an **agent team**, not sequential subagents. The reviewers need to discuss findings with each other.

Create an agent team for reviewing the spec at `$ARGUMENTS` with the following instruction:

**Team Creation Prompt:**

"Create an agent team to conduct a comprehensive, collaborative review of this feature spec: `$ARGUMENTS`

**Team Structure:**

Spawn **3 teammates** using these named subagents:

**1. Requirements Auditor** (Subagent: `requirements-auditor`, Teammate name: `requirements-auditor`)
Your task: conduct a requirements-focused review of the spec at `$ARGUMENTS`. Follow your review checklist and output format.

**2. Technical Skeptic** (Subagent: `technical-skeptic`, Teammate name: `technical-skeptic`)
Your task: conduct a technical feasibility review of the spec at `$ARGUMENTS`. Follow your review checklist and output format.

**3. Devil's Advocate** (Subagent: `devils-advocate`, Teammate name: `devils-advocate`)
Your task: conduct a strategic challenge review of the spec at `$ARGUMENTS`. Follow your review checklist and output format.

---

**Team Mission — Two Phases:**

**PHASE 1: Independent Review**

Each teammate:
1. Follow your agent definition instructions to gather context and conduct your review
2. Document findings as specified in your agent definition
3. Stay focused on your specialized perspective

**PHASE 2: Collaborative Discussion**

After all three reviewers complete their independent analysis:

1. **Share findings** via broadcast:
   - Each reviewer shares their complete findings with the team
   - Highlight your most significant concerns

2. **Challenge and debate**:
   - Question each other's severity assessments
   - Challenge assumptions — if the Devil's Advocate thinks the whole approach is wrong, the Technical Skeptic should respond to whether a simpler alternative is actually feasible
   - If the Requirements Auditor found a gap and the Technical Skeptic says filling it is very complex, debate whether that complexity is acceptable
   - Ask: 'Did you consider...?' or 'What about...?'
   - If you disagree with another reviewer's conclusion, explain why with specifics

3. **Propose collaborative recommendations**:
   - For blocking issues, work together to identify the clearest path forward
   - Requirements Auditor: does the spec need to be rewritten or just extended?
   - Technical Skeptic: if the approach changes, what becomes feasible?
   - Devil's Advocate: if the scope reduces, does the core value survive?

4. **Reach consensus**:
   - Agree on the overall recommendation: APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION
   - Document where the team agrees and where you still disagree
   - Disagreements are valuable — document them clearly

**Discussion Guidelines:**
- Use `broadcast` to share findings with the whole team
- Use `message` to directly question or challenge a specific reviewer
- Be rigorous but constructive
- When you disagree, explain your reasoning with specifics
- Update your findings based on discussion insights

After the collaborative discussion, each teammate should have refined their findings based on team input.

Start the review process now."

---

### Step 3: Monitor Team Progress

While the team works:

1. **Watch for the discussion phase** — ensure teammates are actually messaging each other, not just completing reviews in isolation
2. **Encourage debate** if the discussion is too polite — tell them: "Challenge each other's conclusions more directly"
3. **Intervene if stuck** — if reviewers can't reach consensus on a critical issue, ask them to document both positions clearly

**If teammates aren't discussing:** Send a message to all three: "Please share your findings with each other via broadcast and debate the severity and recommendations."

---

### Step 4: Synthesize Findings

After all teammates complete the discussion phase, gather their final refined findings and produce a unified review:

```markdown
## Spec Review: [Spec Title]

> Reviewed by: Requirements Auditor, Technical Skeptic, Devil's Advocate
> Three independent reviewers analyzed the spec, discussed findings, and reached collaborative consensus.

---

### 📋 Overall Recommendation

**[APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION]**

[2-3 sentence summary of the team's overall assessment]

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

[Parts of the spec the team found clear, complete, and well-reasoned]

---

### 💡 Suggestions and Alternatives

[Improvements, scoping changes, or alternative approaches worth considering]

---

### 🤝 Team Discussion Highlights

[Key moments from the collaborative discussion]
- Where reviewers challenged each other and changed their assessment
- Tradeoffs debated
- Points of genuine disagreement (documented clearly)

---

### 📊 Review Summary

**Requirements Auditor:** [X blocking gaps, Y incomplete areas, Z assumptions to validate]
**Technical Skeptic:** [X blocking risks, Y technical concerns, Z hidden complexity items]
**Devil's Advocate:** [X fundamental challenges, Y questionable assumptions, Z alternatives proposed]

**Consensus Status:**
- Issues with unanimous agreement: X
- Issues with 2/3 agreement: Y
- Issues with split opinions: Z

**Recommendation:** [APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION]
```

Present this synthesis directly in the conversation — do **not** post to a PR or write to a file unless the user asks.

---

### Step 5: Clean Up Team

After presenting the review:

1. Ask each teammate to shut down
2. Wait for confirmation from each
3. Clean up team resources

---

## Example Usage

```
/review-spec SPECIFICATIONS/08-bulk-archive.md
/review-spec 08-bulk-archive
/review-spec interest-signals
```

Expected time: 5-10 minutes depending on spec size and discussion depth.

---

## Recommendation Guide

**APPROVED** — Spec is complete, feasible, and solving the right problem. Proceed with implementation.

**APPROVED WITH CONDITIONS** — Spec is substantially good but has specific gaps or risks that need addressing. Implementation can begin once conditions are met (or with awareness of the risks noted).

**NEEDS REVISION** — Spec has blocking issues: incomplete requirements that would cause rework, a technical approach that won't work as described, or a strategic direction that needs reconsideration. Revise before starting implementation.

---

## Tips

- **Run before starting any non-trivial feature** — the earlier issues are caught, the cheaper they are to fix
- **Let the debate happen** — the discussion phase is where the real value comes from
- **APPROVED WITH CONDITIONS is the most common outcome** — specs almost always have something worth clarifying
- **Use findings to improve the spec** — after review, update the spec to address the issues before archiving it
