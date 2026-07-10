---
name: review-pr-team
description: Comprehensive PR review using four specialist reviewers - security, product, architecture, and documentation - who each analyse the PR independently. Their findings are synthesised into a single review. Use for critical changes requiring thorough multi-perspective analysis.
disable-model-invocation: false
user-invocable: true
argument-hint:
  - PR-number
---

# Multi-Perspective PR Review

This skill reviews a pull request through four specialist lenses at once. Each reviewer analyses the PR independently, with fresh context and no knowledge of what the others found. You — the orchestrator — receive all four reports and synthesise them into one review.

## How this works

**Phase 1: Independent review (parallel)**
Security Specialist, Product Manager, Senior Architect, and Technical Writer each review the PR from their own perspective. They run concurrently and do not communicate with each other.

**Phase 2: Synthesis (you)**
You hold all four reports at once. You deduplicate findings, reconcile severity disagreements, and produce a single verdict.

**Why the reviewers don't talk to each other.** They used to. The discussion phase reliably ran long for little gain — its one real product was severity recalibration when a reviewer lacked context another had, and you can do that yourself from the reports. See [`REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md`](../../../REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md).

---

## Instructions for Claude

When this skill is invoked with a PR number (e.g., `/review-pr-team 1`):

### Step 0: Review-mode gate

Run the gate defined in [`.claude/skills/review-gate.md`](../review-gate.md) → "Gate logic". When rendering the disabled message, substitute this skill's name: `review-pr-team`. If the gate tells you to stop, stop. If it tells you to proceed, continue to Step 1.

*(If you were invoked by `/review-pr` auto-escalating to team tier, the dispatcher has already passed this check — the resolved flag will be `"enabled"` when you get here, and the gate is a fast no-op.)*

### Step 1: Spawn the four reviewers in parallel

**Issue all four `Agent` calls in a single message** so they run concurrently. Do not spawn them one at a time and do not wait for one before starting the next.

**Spawn every reviewer with `isolation: "worktree"`.** Reviewers are read-only by contract, but a reviewer that runs `git checkout` or `gh pr checkout` in the shared working tree silently moves the operator off their branch, and commits they make afterwards miss the PR. The worktree makes that impossible rather than merely forbidden. Cost is sub-second per agent and the worktree is auto-removed, since reviewers change nothing. Do not drop this flag to save time.

Each reviewer's checklist, context-gathering protocol, and output format live in its agent definition. Do not restate them in the task prompt — a prompt that duplicates the agent definition will drift from it.

| Subagent | Task prompt |
|---|---|
| `security-specialist` | `Security-focused review of PR #$ARGUMENTS. Follow your agent definition. Post nothing — return your findings.` |
| `product-reviewer` | `Product-focused review of PR #$ARGUMENTS. Follow your agent definition. Post nothing — return your findings.` |
| `architect-reviewer` | `Architecture-focused review of PR #$ARGUMENTS. Follow your agent definition. Post nothing — return your findings.` |
| `technical-writer` | `Documentation-focused review of PR #$ARGUMENTS. Follow your agent definition. Post nothing — return your findings.` |

Tell the user this is running and roughly how long it takes (~2–4 minutes). Then wait for all four to return.

**If a reviewer fails or returns nothing:** synthesise from the reports you have and state plainly in both the chat summary and the posted comment which perspective is missing. Do not silently review with three. Do not re-spawn it — a reviewer that failed once usually fails the same way twice, and the missing perspective is information the human needs.

### Step 2: Synthesise the reports

You now hold every report. This step is the review — do it properly rather than concatenating four documents.

**2a. Deduplicate by location.** Group findings that name the same `file:line` (or the same specific behaviour). Two reviewers flagging one line is not two findings.

**2b. Reconcile severity.** When reviewers rate the same finding differently:

- **Check whether one report answers the other's stated assumption.** This is the common case and the whole reason synthesis works. If Security rates something 🔴 *"assuming this input isn't validated upstream"* and the Architect's report states the input is validated at the router, the assumption is discharged — demote it, and say why.
- **Weigh the specialist.** On a security question, Security's rating carries more weight than Product's; on a design question, the Architect's does. A reviewer flagging something outside its own specialism is a signal worth recording, not a verdict.
- **If the reports do not settle it, keep the higher severity and record both positions.** Do not average them, do not pick the one you find more persuasive without evidence, and do not go back to the agents for another round. An unresolved disagreement is a real result, and the human reading the PR is better served by seeing it than by seeing a false consensus.

**2c. Do not invent findings.** Every item in the synthesis traces to at least one reviewer's report. Your job is reconciliation, not a fifth review. If you personally spot something none of them did, that belongs in your chat summary to the user, clearly marked as yours — not in the PR comment attributed to the team.

**2d. Build the comment** using this structure:

```markdown
## Comprehensive PR Review — Multi-Perspective Analysis

> Reviewed independently by four specialists — security, product, architecture, documentation — and synthesised into a single verdict.

### ✅ Completion Requirements Met?
- [ ] Tests exist and pass (95%+ coverage shown)
- [ ] Documentation updated (check REFERENCE/ if implementation work)
- [ ] Code quality verified (conventions, no secrets, clean history)

### 🔴 Critical Issues — Must Fix Before Merge

[Each blocking issue, with the reviewer(s) who raised it and the agreed severity]

**Example:**
**Hardcoded API key in `config.ts:42`** 🛡️ Security 🏗️ Architecture
- **Severity:** Critical — flagged independently by two reviewers
- **Security:** secrets in code are an immediate vulnerability
- **Architecture:** violates 12-factor app principles
- **Fix:** use environment variables with validation

### ⚠️ Warnings & Concerns — Should Address

[Non-blocking but important. Show which perspectives raised each.]

**Example (severity reconciled):**
**No error handling in user input handler** 🛡️ Security 📦 Product
- **Reported as:** Security 🔴, Product ⚠️
- **Reconciled to:** ⚠️ — Security's rating assumed the input was unvalidated; the Architect's report confirms it is validated at the router (`routes.ts:31`)
- **Fix:** add defensive error handling for future-proofing

**Example (unresolved):**
**Migration drops the `legacy_id` column** 🏗️ Architecture 📦 Product
- **Reported as:** Architecture ⚠️, Product 🔴
- **Unresolved:** Architecture reads the column as dead; Product believes an external consumer still reads it. Neither report settles whether an external consumer exists.
- **Decide before merge.**

### ✅ Strengths & Good Practices

[What reviewers praised. Note where several converged on the same thing.]

### 💡 Suggestions for Improvement

[Compile from all reports. Deduplicate.]

### 📊 Review Summary

- 🛡️ Security Specialist: [X critical, Y warnings, Z suggestions]
- 📦 Product Manager: [X critical, Y warnings, Z suggestions]
- 🏗️ Senior Architect: [X critical, Y warnings, Z suggestions]
- ✍️ Technical Writer: [X critical, Y gaps, Z suggestions]

**Findings corroborated by 2+ reviewers:** X
**Severity disagreements reconciled during synthesis:** Y
**Severity disagreements left unresolved (flagged above):** Z

**Recommendation:** [BLOCK MERGE / APPROVE WITH CHANGES / APPROVE]

---

*Four specialists reviewed this PR independently; their findings were deduplicated and reconciled into the verdict above.*
```

### Step 3: Post the review

Build the body as a string, write it to a temp file via the Write tool (path `SCRATCH/review-pr-$ARGUMENTS-team.md`), then post with `--body-file`:

```bash
gh pr comment $ARGUMENTS --body-file SCRATCH/review-pr-$ARGUMENTS-team.md
```

Using `--body-file` avoids the brittle heredoc-quoting pattern (where a synthesised review containing the literal token `EOF` on its own line would terminate the heredoc early and either mangle the comment or run unintended shell).

**Read-then-Write fallback (avoid `rm -f`).** If the Write tool errors with *"File has not been read yet"* (because a stale temp file exists at the same path from a prior abandoned run), call **Read on the path first** to satisfy the Write prerequisite, then re-issue the Write. Do **not** use `Bash(rm -f SCRATCH/…)` to clear stale files — `rm -f` is not allowlisted (and shouldn't be broadly allowlisted) so it triggers a manual approval prompt; Read-then-Write stays silent. Don't bother cleaning up the temp file after posting either: the next run handles staleness via the same fallback.

### Step 4: User summary and follow-through

Give a one-line status: recommendation (block / approve with changes / approve) and a link to the PR comment. Say whether any severity disagreements were left unresolved — that's the thing most worth the human's attention.

Then run the follow-through protocol in [`.claude/skills/post-review-follow-through.md`](../post-review-follow-through.md) — re-bucket findings by action tier, surface decisions, and create GitHub issues for anything genuinely out of scope.

If the review returned no findings, skip the protocol and emit: "✅ Clean — nothing to follow up on."

---

## Example usage

```
/review-pr-team 1
```

This will:
1. Spawn four specialist reviewers in parallel
2. Each gathers its own context (PR details, CLAUDE.md, specs, changed files) and reviews independently
3. Synthesise the four reports — dedupe, reconcile severity, resolve or record disagreements
4. Post the unified review to PR #1
5. Run post-review follow-through

Expected time: 2–4 minutes, depending on PR size.

---

## When to use which review

**Use `/review-pr`:** quick sanity checks, small changes, non-critical fixes, docs updates. The dispatcher picks a tier and explains why (1–5 min).

**Use `/review-pr-team`:** critical infrastructure, security-sensitive features, major architectural decisions, complex multi-file changes — or any time you already know the change warrants four perspectives and want to skip triage.

---

## Troubleshooting

**A reviewer returned nothing / errored:** synthesise from the remaining reports and say which perspective is missing, in both the chat summary and the PR comment. Don't re-spawn, and don't quietly ship a three-perspective review labelled as four.

**Reviewers disagree and you can't tell who's right from the reports:** that's an expected outcome, not a failure. Keep the higher severity, document both positions under the finding, and let the human decide. Resist the urge to ask a reviewer a follow-up question — the unbounded back-and-forth that creates is exactly what this design removed.

**The synthesis looks like four documents stapled together:** you skipped Step 2a/2b. Findings that share a `file:line` must be merged, and differing severities on a merged finding must be explicitly reconciled or explicitly recorded as unresolved.
