---
name: review-pr-team
description: Comprehensive PR review using agent teams - security, product, and architecture specialists who debate and challenge each other's findings. Use for critical changes requiring thorough multi-perspective analysis.
disable-model-invocation: false
user-invocable: true
argument-hint:
  - PR-number
---

# Multi-Perspective PR Review with Agent Teams

This skill provides comprehensive pull request review using **agent teams** - three specialized reviewers who independently analyze the PR, then **discuss findings, debate severity, and challenge each other's conclusions** to reach collaborative consensus.

## How This Works

**Phase 1: Independent Review**
- Security Specialist, Product Manager, and Senior Architect each review the PR from their unique perspective
- Each has fresh context (no bias from the main session)

**Phase 2: Collaborative Discussion**
- Reviewers share findings with each other
- Challenge assumptions and debate severity ratings
- Propose solutions collaboratively
- Reach consensus on critical vs non-critical issues

**Phase 3: Synthesis**
- Lead synthesizes the team's collaborative findings
- Posts unified review to PR with clear consensus/disagreements noted

This is fundamentally different from independent reviews - the **discussion phase** surfaces insights that isolated reviewers would miss.

---

## Prerequisites

Agent teams are **experimental and disabled by default**. This skill requires the feature flag to be enabled in `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

This project template comes with it enabled. When copying this skill to a different project, add the flag to that project's `.claude/settings.json`.

---

## Instructions for Claude

When this skill is invoked with a PR number (e.g., `/review-pr-team 1`):

### Step 1: Create Agent Team

**CRITICAL:** You must create an **agent team**, not spawn sequential subagents. The reviewers need to discuss findings with each other, not just report back to you.

Create an agent team for reviewing PR #$ARGUMENTS with the following instruction:

**Team Creation Prompt:**

"Create an agent team to conduct a comprehensive, collaborative review of PR #$ARGUMENTS.

**Team Structure:**

Spawn **3 teammates** using these named subagents:

**1. Security Specialist** (Subagent: `security-specialist`, Teammate name: `security-reviewer`)
Your task: conduct a security-focused review of PR #$ARGUMENTS. Follow your review checklist and output format.

**2. Product Manager** (Subagent: `product-reviewer`, Teammate name: `product-reviewer`)
Your task: conduct a product-focused review of PR #$ARGUMENTS. Follow your review checklist and output format.

**3. Senior Architect** (Subagent: `architect-reviewer`, Teammate name: `architect-reviewer`)
Your task: conduct an architecture-focused review of PR #$ARGUMENTS. Follow your review checklist and output format.

---

**Team Mission - Two Phases:**

**PHASE 1: Independent Review**

Each teammate:
1. Follow your agent definition instructions to gather context and conduct review
2. Document findings as specified in your agent definition
3. Focus on your specialized perspective

**PHASE 2: Collaborative Discussion**

After all three reviewers complete their independent analysis:

1. **Share findings** via broadcast:
   - Each reviewer shares their complete findings with the team
   - Highlight issues you think are most critical

2. **Challenge and debate**:
   - Question each other's severity assessments
   - Challenge assumptions and conclusions
   - Ask: 'Did you consider...?' or 'What about...?'
   - If you disagree with another reviewer's rating, say why
   - If security and architect disagree on a fix approach, debate the trade-offs

3. **Propose collaborative solutions**:
   - For critical issues, work together to identify best fixes
   - Security: ensure fixes don't create new vulnerabilities
   - Product: ensure fixes maintain good UX
   - Architect: ensure fixes align with design patterns

4. **Reach consensus**:
   - Agree on which issues are truly blocking vs nice-to-have
   - Document where the team agrees and where you still disagree
   - Note: It's OK to have disagreements - document them clearly

**Discussion Guidelines:**
- Use `broadcast` to share findings with the whole team
- Use `message` to directly question or challenge a specific reviewer
- Be rigorous but constructive
- Focus on the code, not personalities
- When you disagree, explain your reasoning with specifics
- Update your findings based on discussion insights

**Expected Outcome:**
After the collaborative discussion, each teammate should have refined their findings based on team input. The lead will then synthesize all perspectives into a unified review.

---

**Team Coordination:**
- All teammates work from the shared task list in parallel
- Each reviewer conducts their independent review simultaneously
- Once all three are done, open discussion begins for debate and consensus-building

Start the review process now."

---

### Step 2: Monitor Team Progress

While the team works:

1. **Watch for the discussion phase** - Ensure teammates are actually messaging each other, not just completing reviews in isolation
2. **Encourage debate** if the discussion is too polite - tell them: "Challenge each other's conclusions more directly"
3. **Intervene if stuck** - If reviewers can't reach consensus on a critical issue, ask them to document both positions clearly

**If teammates aren't discussing:** Send a message to all three: "Please share your findings with each other via broadcast and debate the severity ratings."

---

### Step 3: Synthesize Collaborative Findings

After all teammates complete the discussion phase:

1. **Gather final findings** from all three reviewers (after they've refined based on team discussion)

2. **Create unified review** that captures the collaborative analysis:

```markdown
## Comprehensive PR Review - Collaborative Team Analysis

> This review was conducted by a team of specialized reviewers who independently analyzed the PR, then discussed findings, debated severity, and reached collaborative consensus.

### ✅ Completion Requirements Met?
- [ ] Tests exist and pass (95%+ coverage shown)
- [ ] Documentation updated (check REFERENCE/ if implementation work)
- [ ] Code quality verified (conventions, no secrets, clean history)

### 🔴 Critical Issues - Must Fix Before Merge

[List all blocking issues with consensus severity]
[For each issue, show which reviewers flagged it]
[If reviewers debated and reached consensus, note: "Team consensus after discussion"]
[If reviewers still disagree, note both positions clearly]

**Example:**
**Issue: Hardcoded API key in config.ts:42** 🛡️ Security 🏗️ Architecture
- **Severity:** Critical (unanimous)
- **Security perspective:** Secrets in code = immediate vulnerability
- **Architect perspective:** Violates 12-factor app principles
- **Recommended fix:** Use environment variables with validation
- **Team consensus:** Block merge until fixed

### ⚠️ Warnings & Concerns - Should Address

[List non-blocking but important issues]
[Show which perspectives raised each concern]
[Note where team discussion added nuance]

**Example:**
**Issue: No error handling in user input handler** 🛡️ Security 📦 Product
- **Initial severity:** Security rated Critical, Product rated Warning
- **After discussion:** Agreed on Warning (non-critical path, but should fix)
- **Why not blocking:** Input is already validated upstream (Architect confirmed)
- **Recommended fix:** Add defensive error handling for future-proofing

### ✅ Strengths & Good Practices

[Highlight what the team praised]
[Note patterns multiple reviewers appreciated]

**Example:**
**Comprehensive test coverage** ✅ All reviewers
- Unit tests, integration tests, and edge cases covered
- Architect: "Test structure is exemplary"
- Product: "Edge cases thoroughly tested"
- Security: "Attack vectors properly validated in tests"

### 💡 Suggestions for Improvement

[Compile suggestions from team discussion]
[Note where reviewers built on each other's ideas]

### 🤝 Team Discussion Highlights

[Capture key moments from the collaborative discussion]
- Where debate changed severity ratings
- Where one reviewer's insight helped others
- Tradeoffs that were discussed
- Creative solutions that emerged from collaboration

### 📊 Review Summary

**Team Composition:**
- 🛡️ Security Specialist: [X critical, Y warnings, Z suggestions]
- 📦 Product Manager: [X critical, Y warnings, Z suggestions]
- 🏗️ Senior Architect: [X critical, Y warnings, Z suggestions]

**Consensus Status:**
- Issues with unanimous agreement: X
- Issues with 2/3 agreement: Y
- Issues with split opinions: Z (documented above)

**Recommendation:** [BLOCK MERGE / APPROVE WITH CHANGES / APPROVE]

---

*This review was conducted by an agent team using collaborative discussion. Reviewers independently analyzed the PR, then shared findings, challenged each other's conclusions, and reached consensus through structured debate.*
```

3. **Post the synthesized review** as a comment on the PR:

```bash
gh pr comment $ARGUMENTS --body "[markdown content from above]"
```

4. **Provide user summary:**
   - Total critical issues found
   - Key insights from team discussion
   - Whether reviewers reached consensus
   - Clear next steps
   - Link to PR comment

---

### Step 4: Clean Up Team

After posting the review:

1. **Shut down all teammates gracefully:**
   - Ask each teammate to shut down
   - Wait for confirmation from each

2. **Clean up team resources:**
```text
Clean up the team
```

---

## Example Usage

```
/review-pr-team 1
```

This will:
1. Create agent team with security, product, and architect reviewers
2. Team gathers their own context (PR details, CLAUDE.md, specs, changed files)
3. Reviewers independently analyze the PR
4. Reviewers discuss findings, debate severity, and reach consensus
5. Lead synthesizes collaborative findings
6. Post comprehensive review to PR #1
7. Clean up team

Expected time: 5-10 minutes (depending on PR size and discussion depth)

---

## Tips for Best Results

- **Use for non-trivial PRs** - The collaborative discussion adds value for complex changes
- **Let the debate happen** - Don't rush the discussion phase; insights emerge from challenge
- **Watch for politeness** - If reviewers are too agreeable, encourage more rigorous debate
- **Document disagreements** - Split opinions are valuable information for the PR author
- **Trust the process** - The discussion phase often surfaces issues individual reviewers miss

---

## When to Use Which Review

**Use `/review-pr`:**
- Quick sanity checks
- Small, straightforward changes
- Non-critical bug fixes
- Documentation updates
- You want fast feedback (1-2 minutes)

**Use `/review-pr-team`:**
- Critical infrastructure changes
- Security-sensitive features
- Major architectural decisions
- Complex multi-file changes
- When multiple perspectives add real value
- You want thorough collaborative analysis (5-10 minutes)

---

## Troubleshooting

**If teammates aren't discussing:**
- Tell them explicitly: "Share your findings via broadcast and debate the severity ratings"
- Check that they've all completed Phase 1 before expecting Phase 2

**If discussion is too shallow:**
- Encourage deeper debate: "Challenge each other's assumptions more directly"
- Ask specific questions: "Security reviewer - do you agree with the architect's assessment of this pattern?"

**If team doesn't shut down cleanly:**
- List running teammates and shut them down individually
- Run cleanup manually after all teammates are stopped

**If you see "session resumption" issues:**
- Known limitation: `/resume` doesn't restore in-process teammates
- Tell the lead to spawn new teammates if this happens
