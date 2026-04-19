---
name: review-pr
description: Full-Stack Developer PR Review - use for reviewing changes of a non critical or non architectural nature, for large changes with potential security and architecture impact use the skill /review-pr-team instead.
disable-model-invocation: false
user-invocable: true
argument-hint:
  - PR-number
---
# Full-Stack Developer PR Review

This skill provides a comprehensive pull request review from an experienced full-stack developer perspective, covering code quality, security, functionality, and best practices.

## How This Works

A single expert full-stack developer reviews the PR and provides actionable feedback.

---

## Instructions for Claude

When this skill is invoked with a PR number (e.g., `/review-pr 2`):

### Step 1: Spawn Code Reviewer Agent

**CRITICAL:** You must spawn an independent subagent for this review. DO NOT review the PR yourself in this session. The reviewer needs fresh, unbiased context.

Spawn a **`general-purpose`** agent with this task (the `code-reviewer` custom agent type is not supported by the Agent tool — embed instructions directly):

**Task:** "You are an experienced full-stack developer conducting an independent code review of PR #$ARGUMENTS in the repo at the current working directory. This is a fresh review — approach it objectively.

**Context gathering:** Run `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS`. Read `CLAUDE.md` in the repo root. Read any changed files in full where needed.

**Review dimensions:** Functionality (bugs, edge cases), Code quality (readability, naming), Security (vulnerabilities, auth), Testing (coverage adequate?), Conventions (ABOUT comments, project patterns).

**Completion requirements (MANDATORY):**
- [ ] Tests exist and pass (95%+ coverage)
- [ ] Code quality verified (conventions, no secrets, clean history)
Flag any missing requirement as 🔴 Critical Issue blocking merge.

**Output format:**
### ✅ Completion Requirements Met?
### ✅ Well Done
### 🔴 Critical Issues
### ⚠️ Suggestions
### 💡 Nice-to-Haves

Use file:line references. Be practical. Post nothing — return findings only."

Wait for the review to complete.

---

### Step 2: Spawn Documentation Reviewer Agent

After the code review completes, spawn a **`technical-writer`** subagent for a documentation pass:

**Task:** "Conduct a documentation review of PR #$ARGUMENTS. Run `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS` to see what changed. Check whether REFERENCE/ docs were updated, CLAUDE.md is current, new files have ABOUT comments, and no temporal language was introduced. Post nothing — return findings only."

Wait for the documentation review to complete.

---

### Step 3: Post Combined Results

After both reviews are complete, combine their findings and post as a single comment on the PR:

```bash
gh pr comment $ARGUMENTS --body "[combined markdown from both reviews]"
```

Structure the combined comment with code review findings first, documentation findings second. If the documentation reviewer found no issues, a brief "✅ Documentation: No issues found" is sufficient.

Provide user summary:
- Total issues found (critical vs suggestions), split by code vs documentation
- Clear recommendation (approve/request changes)
- Key action items
- Link to PR comment

---

## Example Usage

```
/review-pr 2
```

This will:
1. Spawn independent full-stack developer reviewer
2. Reviewer gathers their own context (PR details, CLAUDE.md, specs, changed files)
3. Reviewer conducts comprehensive review
4. Post review to PR #2

---

## Tips for Best Results

- **Use for all implementation PRs** - Quick sanity check
- **Faster than multi-perspective** - ~1-2 minutes vs 3-5 minutes
- **Broad coverage** - Catches most common issues
- **Upgrade to /review-pr-team** - For critical/complex PRs needing deep analysis

---

## When to Use Which Review

**Use `/review-pr`:**
- Regular implementation PRs
- Quick sanity checks
- You want fast feedback
- Standard feature work

**Use \****`/review-pr-team`**\*\*:**
- Critical infrastructure changes
- Security-sensitive features
- Major architectural decisions
- Need multiple expert perspectives
