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

### Step 1: Spawn Independent Reviewer - Let Them Gather Their Own Context

**IMPORTANT:** The reviewer agent has access to all the same tools you do (Bash, Read, Grep, Glob, etc.). Don't pre-gather context for them - this can create stale context if files have been updated since you last read them. Let the reviewer fetch what they need directly.

**CRITICAL:** You must spawn an independent subagent for this review. DO NOT review the PR yourself in this session. The reviewer needs fresh, unbiased context.

Spawn a **general-purpose** subagent with this task:

**Task:** "You are an experienced full-stack developer conducting an independent code review of PR #$ARGUMENTS.

CRITICAL: This is a fresh review. You have NOT been involved in writing this code. Review it objectively as if you're seeing it for the first time.

**IMPORTANT - Gather Your Own Context:**

You have full access to all tools. Before starting your review, gather the context you need:

1. **Fetch PR details:**
   ```bash
   gh pr view $ARGUMENTS
   gh pr diff $ARGUMENTS
   gh pr view $ARGUMENTS --comments
   ```

2. **Read project foundation:**
   - Read `CLAUDE.md` in repository root for architecture, conventions, and testing philosophy
   - Read any other CLAUDE.md files in subdirectories if relevant to the PR

3. **Discover relevant specifications:**
   - Extract keywords from PR title, description, and changed files
   - Use Bash/Glob to list files in `SPECIFICATIONS/` directory (if it exists)
   - Read specifications that match the PR's scope
   - Follow links to related specs as needed

4. **Review changed files:**
   - Use the PR diff to understand what changed
   - Read full file context where needed using the Read tool
   - Check for related files that might be affected

**Why gather your own context?** This ensures you see the LATEST committed state of all files, avoiding stale context if files were updated after the main session read them.

**Your Mission:**
Conduct a comprehensive, unbiased review across all dimensions:

**Code Quality:**
- Is the code readable and maintainable?
- Appropriate naming conventions?
- Proper error handling?
- Code organization and structure?
- Comments where needed (but not over-commented)?

**Functionality:**
- Does this implement the requirements correctly?
- Are there bugs or logical errors?
- Edge cases handled?
- Does it actually work as intended?

**Security:**
- Any security vulnerabilities? (XSS, injection, auth bypass, etc.)
- Secrets properly managed?
- Input validation adequate?
- Authentication/authorization correct?

**Architecture & Design:**
- Fits well with existing codebase?
- Design patterns used appropriately?
- Not over-engineered or under-engineered?
- Future extensibility considered?

**Performance:**
- Any obvious performance issues?
- Appropriate use of caching?
- Database queries optimized (if applicable)?
- Resource usage reasonable?

**Testing:**
- Are tests included (if needed)?
- Test coverage adequate?
- Tests actually test the right things?

**TypeScript/Types:**
- Proper use of types (no `any` unless necessary)?
- Type safety maintained?
- Interfaces/types well-defined?

**Best Practices:**
- Follows project conventions?
- No deprecated patterns?
- Dependencies appropriate and up-to-date?
- Breaking changes documented?

**Output Format:**
- ✅ **Well Done**: What's good about this PR
- 🔴 **Critical Issues**: Must fix before merge (blocking)
- ⚠️ **Suggestions**: Should consider (not blocking)
- 💡 **Nice-to-Haves**: Optional improvements

Be specific with file:line references. Be practical and pragmatic - focus on issues that actually matter. Don't be pedantic about minor style issues if the code is otherwise solid."

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
