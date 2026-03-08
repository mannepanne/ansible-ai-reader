---
name: review-pr
description: Full-Stack Developer PR Review
disable-model-invocation: true
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

### Step 1: Fetch PR Context

Use GitHub CLI to gather PR information:

```bash
gh pr view $ARGUMENTS
gh pr diff $ARGUMENTS
gh pr view $ARGUMENTS --comments
```

Review the files changed, commit messages, and any existing comments.

---

### Step 2: Intelligently Gather Relevant Context

Use this systematic approach to gather just enough context for a thorough review:

**A. Always Read Foundation (MANDATORY):**

1. Read `CLAUDE.md` in repository root for:
   - Project architecture and structure
   - Development workflow and conventions
   - Key patterns and technology stack
   - Testing philosophy

**B. Extract PR Keywords:**

From PR title, description, and changed file paths, extract relevant keywords:
- Feature names (blog, auth, admin, api, etc.)
- Component types (routes, utils, components, etc.)
- Phase numbers (phase-1, phase-2, etc.)
- Technical areas (security, testing, deployment, etc.)

Examples:
- PR title "Phase 2: Public pages" → keywords: "public", "pages", "phase", "2"
- Changed files include `src/routes/updatesList.ts` → keywords: "updates", "routes", "list"
- PR mentions "authentication" → keywords: "auth", "login", "security"

**C. Discover Relevant Specifications:**

1. List files in `SPECIFICATIONS/` directory using Bash or Glob
2. Match spec filenames against PR keywords
3. Read specifications that match, prioritizing:
   - Files matching feature names (e.g., `*blog*.md` if PR involves blog)
   - `*-implementation.md` if PR implements a feature
   - `*-security.md` if security-related changes detected
   - `testing-*.md` if tests are included or test files changed
   - `*-mvp.md` or `*-plan.md` for main feature specs

**D. Follow Relevant Links (Selective):**

- In each spec read, check "Related Documents" sections
- Follow links to specs that match PR keywords
- Don't read every linked doc - be selective based on relevance
- Example: If spec links to testing strategy and PR includes tests, read it

**E. Create Context Summary:**

Synthesize gathered information into a structured summary including:
- Project architecture and conventions (from CLAUDE.md)
- What this PR should achieve (from specs and PR description)
- Key requirements and success criteria
- Security requirements (if applicable)
- Testing expectations (if applicable)
- Architectural decisions made

**If no specifications found:** Reviewer will evaluate based on project architecture (from CLAUDE.md) and general best practices.

**Note:** This approach is future-proof - it discovers relevant context for any PR without hard-coding specific files.

---

### Step 3: Full-Stack Developer Review

IMPORTANT: You must spawn an independent subagent for this review. DO NOT review the PR yourself in this session. The reviewer needs fresh, unbiased context.

Spawn a **general-purpose** subagent with this task:

**Task:** "You are an experienced full-stack developer conducting an independent code review of PR #$ARGUMENTS.

CRITICAL: This is a fresh review. You have NOT been involved in writing this code. Review it objectively as if you're seeing it for the first time.

**Project Context:**
[Paste the context summary from Step 2, including project architecture from CLAUDE.md, requirements, and architectural decisions]

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

### Step 4: Post Results

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
1. Fetch PR #2 details
2. Run full-stack developer review
3. Post comprehensive review to PR #2

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
