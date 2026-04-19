# Pull Request Review Workflow
REFERENCE > Development > PR Review Workflow

Automated PR review skills and workflow using agent teams.

## When to Read This
- Creating pull requests
- Requesting code reviews
- Understanding review process
- Choosing between review types
- Interpreting review feedback

## Related Documentation
- [Testing Strategy](./testing-strategy.md) - Test requirements
- [Code Conventions](./code-conventions.md) - Coding standards
- [Local Development](./local-development.md) - Pre-commit workflow
- [Root CLAUDE.md](../../CLAUDE.md) - Development workflow overview

---

## Skills Available

- **`/review-spec`** - Pre-implementation spec review by a challenger team (requirements auditor, technical skeptic, devil's advocate) — runs *before* any code is written
- **`/review-pr`** - Fast full-stack reviewer + documentation check on a PR (2-3 min)
- **`/review-pr-team`** - Collaborative multi-perspective PR review with four specialists (5-10 min)

---

## Overview

This project uses automated PR review skills powered by agent teams. Reviews use fresh context (not biased by main session) and provide comprehensive, actionable feedback.

---

## Quick Reference

### Use `/review-spec` for:
✅ Validating a feature spec before any code is written
✅ Surfacing missing edge cases, unstated assumptions, or unclear user flows
✅ Challenging the "why" and "is there a simpler way" framing
✅ Avoiding sunk-cost fights with an implementation built on a shaky spec

**Time:** 3-5 minutes
**Reviewers:** Requirements auditor, technical skeptic, devil's advocate

### Use `/review-pr` for:
✅ Regular implementation PRs
✅ Quick sanity checks
✅ Small, straightforward changes
✅ Non-critical bug fixes
✅ Documentation updates
✅ When you want fast feedback

**Time:** 2-3 minutes
**Reviewers:** Full-stack code reviewer + technical writer (documentation completeness pass)

### Use `/review-pr-team` for:
✅ Critical infrastructure changes
✅ Security-sensitive features
✅ Major architectural decisions
✅ Complex multi-file changes
✅ When multiple perspectives add real value
✅ When you want thorough collaborative analysis

**Time:** 5-10 minutes
**Reviewers:** Security Specialist, Product Manager, Senior Architect, Technical Writer (agent team of four with collaborative discussion)

---

## How `/review-spec` Works

**Pre-implementation challenger team:**
1. Takes a spec file (or a section of `SPECIFICATIONS/`) as input
2. Spawns three challenger agents who each attack the spec from a different angle
3. Agents debate and challenge each other's findings to surface blind spots
4. Posts findings back so the spec can be revised before code is written

**The three challengers:**

**Requirements Auditor** 📋
- Completeness — missing edge cases, error states, undefined behaviour
- Unclear user flows, unstated assumptions
- Acceptance criteria that cannot be objectively verified

**Technical Skeptic** 🧪
- Buildability — DB implications, blast radius on existing features
- Hidden complexity, integration risks, security surface area
- Things that look simple in the spec but aren't in this codebase

**Devil's Advocate** 😈
- Challenges the "why" — is this the right solution at all?
- Simpler alternatives, cheaper framings
- Baked-in assumptions that could be wrong

**When to use:** any time a new feature spec is being prepared. Much cheaper to rework a spec than to rework code built from a weak spec.

---

## How `/review-pr` Works

**Two-stage fresh-context review:**
1. Stage 1 — spawns a full-stack code reviewer (not main session) who loads project context and reviews the PR across all dimensions
2. Stage 2 — spawns a technical writer who checks documentation completeness (REFERENCE/ updates, CLAUDE.md currency, ABOUT comments, no temporal language)
3. Both post findings as PR comments

**Review dimensions (code reviewer):**
- Code quality (readability, naming, error handling)
- Functionality (bugs, edge cases, correctness)
- Security (vulnerabilities, secrets management)
- Architecture & design (fit, patterns, extensibility)
- Performance (optimization, caching, queries)
- Testing (coverage, quality of tests)
- TypeScript/types (type safety, proper usage)
- Best practices (conventions, no deprecated patterns)

**Review dimensions (technical writer):**
- REFERENCE/ docs updated for the change
- CLAUDE.md current (test counts, feature status)
- ABOUT comments present on new files
- No temporal language ("new", "improved", "recently added")
- New features documented

**Output format:**
- ✅ **Well Done** - What's good
- 🔴 **Critical Issues** - Must fix (blocking)
- ⚠️ **Suggestions** - Should consider (not blocking)
- 💡 **Nice-to-Haves** - Optional improvements

---

## How `/review-pr-team` Works

**Agent team collaboration:**
1. Creates agent team with 4 specialized reviewers
2. **Phase 1: Independent Review** - Each reviews from their perspective
3. **Phase 2: Collaborative Discussion** - Reviewers debate, challenge, reach consensus
4. Posts synthesized findings with discussion highlights

**The four reviewers:**

**Security Specialist** 🛡️
- Authentication, authorization, secrets
- XSS, CSRF, SQL injection, input validation
- Session security, dependency vulnerabilities

**Product Manager** 📦
- Requirements alignment, UX
- Edge cases, error handling, completeness
- Documentation, backward compatibility

**Senior Architect** 🏗️
- Design patterns, code quality
- Scalability, maintainability, testing
- Technical debt, performance, architectural fit

**Technical Writer** ✍️
- REFERENCE/ docs updated for the change
- CLAUDE.md current, ABOUT comments present
- No temporal language, new features documented
- Cross-references and links stay accurate

**Key difference from `/review-pr`:**
- Reviewers **actually discuss** findings with each other
- They **challenge** each other's severity assessments
- They **debate** tradeoffs and propose solutions together
- Lead synthesizes collaborative insights (not just four independent reports)

**Output includes:**
- Team consensus on critical issues
- Documented disagreements (valuable signal)
- Discussion highlights (how debate changed ratings)
- Collaborative solutions that emerged

---

## Usage Examples

### Running a Quick Review
```bash
# In your PR description or as a comment
/review-pr 42
```

The skill will:
1. Fetch PR #42 details
2. Intelligently gather relevant context (CLAUDE.md, matching specs)
3. Spawn fresh reviewer
4. Post comprehensive review
5. Provide summary with recommendation

### Running Team Review
```bash
# For critical changes
/review-pr-team 42
```

The skill will:
1. Fetch PR #42 details
2. Gather project context
3. Create agent team (4 reviewers: security, product, architect, technical writer)
4. Reviewers independently analyze
5. Reviewers discuss and debate findings
6. Lead synthesizes collaborative analysis
7. Post unified review with discussion highlights
8. Clean up team

---

## Best Practices

### Before Requesting Review

**Pre-commit checklist:**
```bash
npm test                  # All tests pass
npx tsc --noEmit         # Type check passes
git status               # Verify what's included
git diff                 # Review your own changes first
```

**PR description should include:**
- What changed and why
- How to test manually (if needed)
- Any deployment considerations
- Links to relevant specs/issues

### Interpreting Review Results

**Critical Issues (🔴):**
- Address before merging
- These are blockers
- Ask for clarification if needed

**Suggestions (⚠️):**
- Consider seriously
- May address now or later
- Not blocking merge

**Nice-to-Haves (💡):**
- Optional improvements
- Consider for future work
- Track in technical debt if deferred

### Working with Team Reviews

**If reviewers disagree:**
- Both perspectives are valuable
- Understand the tradeoffs
- Make informed decision
- Document your choice in PR

**If discussion seems shallow:**
- Reviewers might be too polite
- You can ask them to "challenge each other more directly"
- The debate phase surfaces better insights

**Team consensus vs split:**
- Unanimous agreement = high confidence
- 2/3 agreement = strong signal
- Split opinions = requires judgment call

---

## Integration with Development Workflow

### Standard Workflow

1. Create feature branch: `git checkout -b feature/feature-name`
2. Write or review the spec in `SPECIFICATIONS/`
3. **Run `/review-spec <spec-file>`** to surface missing requirements, hidden complexity, or framing issues *before* writing code
4. Implement with tests: `npm test && npx tsc --noEmit`
5. Create PR
6. **Run `/review-pr`** for quick validation (code + docs)
7. Address feedback
8. Merge when approved

### Critical Changes Workflow

1. Create feature branch
2. Write or review spec
3. **Run `/review-spec <spec-file>`** — surfaces missing requirements, hidden complexity, and framing issues before sunk cost starts
4. Address blocking spec issues; iterate on spec until challengers clear it
5. Consider using plan mode (`EnterPlanMode` Claude Code tool) for complex features
6. Implement with comprehensive tests
7. Self-review: `git diff`, verify no secrets/debug code
8. Create PR with detailed description
9. **Run `/review-pr-team`** for multi-perspective analysis (4 reviewers including documentation)
10. Reviewers discuss findings collaboratively
11. Address critical issues and consensus concerns
12. Document decisions on split opinions
13. Merge when approved

---

## Troubleshooting

### Review seems biased or incomplete
- Skills spawn fresh agents (not main session)
- If context seems wrong, check that relevant specs are in SPECIFICATIONS/
- Skills auto-discover specs by keywords from PR

### Team reviewers not discussing
- Tell them: "Share findings via broadcast and debate severity"
- Check Phase 1 is complete before expecting Phase 2
- If too polite: "Challenge each other's assumptions more directly"

### Review posted but nothing seems wrong
- Green light is valuable signal
- Check "Well Done" section for validation
- Proceed with confidence

### Want more detail on specific issue
- Ask reviewer directly (they're still in context)
- Request specific analysis: "Expand on the XSS concern"

---

## Agent Teams Feature

**Status:** Enabled in this project via `settings.json`

The `/review-pr-team` skill uses Claude Code's experimental **agent teams** feature, which enables:
- Multiple agents working in parallel
- Direct inter-agent communication (`message`, `broadcast`)
- Shared task list coordination
- Collaborative discussion and debate

**Key capabilities:**
- Agents have independent context windows
- They can challenge and question each other
- Discussion surfaces insights individual reviewers miss
- Lead synthesizes collaborative findings

**See:** [Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams)

---

## Related Documentation

- [Testing Strategy](./testing-strategy.md) - Test requirements and TDD workflow
- [Code Conventions](./code-conventions.md) - Coding standards
- [Local Development](./local-development.md) - Running tests before PR
- [Root CLAUDE.md](../../CLAUDE.md) - Complete development workflow
