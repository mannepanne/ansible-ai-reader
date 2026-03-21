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

Spawn a **general-purpose** subagent with this task:

**Task:** "Read `.claude/agents/code-reviewer.md` for your role and instructions, then conduct a comprehensive code review of PR #$ARGUMENTS following those guidelines.

Replace [PR_NUMBER] in the agent instructions with $ARGUMENTS."

Wait for the review to complete.

---

### Step 2: Post Results

After the review is complete:

Post the review as a comment on the PR using:

```bash
gh pr comment $ARGUMENTS --body "[markdown content from review]"
```

Provide user summary:
- Total issues found (critical vs suggestions)
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

**Use \****`/review-pr`**\*\*:**
- Regular implementation PRs
- Quick sanity checks
- You want fast feedback
- Standard feature work

**Use \****`/review-pr-team`**\*\*:**
- Critical infrastructure changes
- Security-sensitive features
- Major architectural decisions
- Need multiple expert perspectives
