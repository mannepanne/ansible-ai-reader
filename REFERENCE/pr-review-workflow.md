# Pull Request Review Workflow

**Related Documents:**
- [Development Workflow](../CLAUDE.md#development-workflow)
- [Testing Strategy](./testing-strategy.md)

**Skills Available:**
- `/review-pr` - Fast single-reviewer (1-2 min)
- `/review-pr-team` - Collaborative multi-perspective (5-10 min)

---

## Overview

This project uses automated PR review skills powered by agent teams. Reviews use fresh context (not biased by main session) and provide comprehensive, actionable feedback.

---

## Quick Reference

### Use `/review-pr` for:
✅ Regular implementation PRs
✅ Quick sanity checks
✅ Small, straightforward changes
✅ Non-critical bug fixes
✅ Documentation updates
✅ When you want fast feedback

**Time:** 1-2 minutes
**Reviewer:** Single full-stack developer with fresh context
**Model:** Sonnet (fast, capable)

### Use `/review-pr-team` for:
✅ Critical infrastructure changes
✅ Security-sensitive features
✅ Major architectural decisions
✅ Complex multi-file changes
✅ When multiple perspectives add real value
✅ When you want thorough collaborative analysis

**Time:** 5-10 minutes
**Reviewers:** Security Specialist, Product Manager, Senior Architect (agent team with collaborative discussion)
**Model:** Opus for all three reviewers (more thorough reasoning)

---

## How `/review-pr` Works

**Fresh context approach:**
1. Spawns independent subagent (not main session)
2. Agent loads project context (CLAUDE.md, relevant specs)
3. Reviews PR comprehensively across all dimensions
4. Posts findings as PR comment

**Review dimensions:**
- Code quality (readability, naming, error handling)
- Functionality (bugs, edge cases, correctness)
- Security (vulnerabilities, secrets management)
- Architecture & design (fit, patterns, extensibility)
- Performance (optimization, caching, queries)
- Testing (coverage, quality of tests)
- TypeScript/types (type safety, proper usage)
- Best practices (conventions, no deprecated patterns)

**Output format:**
- ✅ **Well Done** - What's good
- 🔴 **Critical Issues** - Must fix (blocking)
- ⚠️ **Suggestions** - Should consider (not blocking)
- 💡 **Nice-to-Haves** - Optional improvements

---

## How `/review-pr-team` Works

**Agent team collaboration:**
1. Creates agent team with 3 specialized reviewers
2. **Phase 1: Independent Review** - Each reviews from their perspective
3. **Phase 2: Collaborative Discussion** - Reviewers debate, challenge, reach consensus
4. Posts synthesized findings with discussion highlights

**The three reviewers:**

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

**Key difference from `/review-pr`:**
- Reviewers **actually discuss** findings with each other
- They **challenge** each other's severity assessments
- They **debate** tradeoffs and propose solutions together
- Lead synthesizes collaborative insights (not just 3 independent reports)

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
3. Create agent team (3 reviewers)
4. Reviewers independently analyse
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
2. Check relevant specs in `SPECIFICATIONS/`
3. Implement with tests: `npm test && npx tsc --noEmit`
4. Create PR
5. **Run `/review-pr`** for quick validation
6. Address feedback
7. Merge when approved

### Critical Changes Workflow

1. Create feature branch
2. Review specs and architectural guidelines
3. Consider using EnterPlanMode for complex features
4. Implement with comprehensive tests
5. Self-review: `git diff`, verify no secrets/debug code
6. Create PR with detailed description
7. **Run `/review-pr-team`** for multi-perspective analysis
8. Reviewers discuss findings collaboratively
9. Address critical issues and consensus concerns
10. Document decisions on split opinions
11. Merge when approved

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

## Sub-agent architecture

Reviewer agents are defined as named sub-agents in `.claude/agents/` using YAML frontmatter. Each agent file registers a persona, toolset, and model — the skill invokes them by name.

**Agent definitions:**
- `code-reviewer.md` — used by `/review-pr` (Sonnet)
- `security-specialist.md` — used by `/review-pr-team` (Opus)
- `product-reviewer.md` — used by `/review-pr-team` (Opus)
- `architect-reviewer.md` — used by `/review-pr-team` (Opus)

**Why separate files?** Agent definitions are reusable and evolvable independently from skill orchestration logic. Update reviewer behaviour once; all skills that use it benefit automatically.

---

**Note:** These skills use intelligent context discovery - they automatically find and read relevant SPECIFICATIONS/ files based on PR keywords. Keep specs up-to-date for best results.
