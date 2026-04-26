# Review Workflow

**Related Documents:**
- [Development Workflow](../../CLAUDE.md#development-workflow)
- [Testing Strategy](./testing-strategy.md)

**Skills Available:**
- `/review-spec` - Pre-implementation spec review (2-7 min) ← run before writing code
- `/review-pr` - Smart PR review dispatcher — triages the change and routes to light / standard / team (1-5 min end-to-end; longer when auto-escalated to team tier)
- `/review-pr-team` - Forces full multi-perspective team review, skipping triage (2-7 min)

---

## Configuration

The review system is **opt-in per project**, gated by a single flag in [`.claude/project-config.json`](../../.claude/project-config.json):

```json
{ "prReviewMode": "enabled" | "disabled" | "prompt-on-first-use" }
```

- **`"prompt-on-first-use"`** (template default): Claude asks you at the first review-adjacent moment — the first time you invoke any `/review-*` skill, the first time you mention creating a PR or finishing a feature, or the first time you ask what the template provides. Your answer persists.
- **`"enabled"`**: all three review skills (`/review-pr`, `/review-pr-team`, `/review-spec`) run normally.
- **`"disabled"`**: every review skill becomes a no-op, replying with a one-line "disabled" message that includes how to re-enable. Useful for throwaway experiments where the token cost isn't worth it.

To change the setting, edit the file directly. The flag applies to all three review skills — all-or-nothing by design.

### Local override — `.claude/project-config.local.json`

The committed `.claude/project-config.json` governs what cloners inherit. For template maintainers or individual contributors who want to run reviews locally while keeping a different committed default, a gitignored `.claude/project-config.local.json` may override the committed value:

```json
{ "prReviewMode": "enabled" }
```

When the local file exists, the gate merges its top-level keys on top of the committed file — local wins. When the gate persists a new value (e.g. the user answers the pitch), the write goes to the local file if it exists, otherwise to the committed file. This means dogfooding the review system on the template repo itself won't accidentally flip the default for cloners.

If a local override has the same value as the committed file, it's a no-op and can be deleted.

The canonical gate logic (read order, branch rules, persist semantics, malformed-JSON handling) lives in [`.claude/skills/review-gate.md`](../../.claude/skills/review-gate.md). Each `/review-*` skill's Step 0 is a one-line reference to that file. The Layer 1 contextual-surfacing rules (when Claude proactively raises the pitch outside of a skill invocation) live in [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) → "Automated PR review system", since they need to be auto-loaded.

---

## Overview

This project uses automated review skills powered by agent teams. Reviews use fresh context (not biased by main session) and provide comprehensive, actionable feedback.

There are two review phases in the workflow:
1. **Before implementation** — `/review-spec` catches wrong assumptions, missing requirements, and feasibility risks before any code is written
2. **Before merge** — `/review-pr` or `/review-pr-team` verify the implementation is correct, secure, and well-documented

---

## Quick Reference

### Use `/review-spec` for:
✅ Any non-trivial feature before implementation starts
✅ When the spec has been written but not yet reviewed
✅ When you want to catch wrong assumptions before writing code
✅ When the approach feels uncertain or under-specified

**Time:** 2-7 minutes
**Reviewers:** Requirements Auditor, Technical Skeptic, Devil's Advocate (agent team)
**Outputs to:** Conversation (not a PR comment)

### Use `/review-pr` for:
✅ **Almost every PR.** This is the default — the dispatcher picks the right depth automatically.

`/review-pr` runs a fast triage pass first (path signals, size, secret-scan) and announces its decision in plain language before any deeper reviewer runs. You'll see something like:

```
🎯 Triage: light
   Docs-only change in REFERENCE/ with no code paths touched.
   Small (23 lines across 2 files)
```

It then routes to one of three tiers:

| Tier | What runs | Typical case | Time |
|---|---|---|---|
| **light** | 2 reviewers, narrow scope (light-reviewer + technical-writer in light-mode) | Docs, tests, styling, comment-only diffs | ~1 min |
| **standard** | Code review + doc review | Typical feature work, business logic, utilities | ~2-4 min |
| **team** | Multi-perspective team with debate | Data-layer / Supabase migrations / RLS, auth, CI, deps, secrets | ~2-7 min |

If the triage decision looks wrong, you can interrupt and force a deeper tier with `/review-pr-team N`.

### Use `/review-pr-team` for:
✅ When you **already know** it's critical and want to skip triage
✅ Re-running deeper analysis after a `light` or `standard` pass surfaced concerns
✅ Situations where you want all four specialist perspectives (security, product, architect, docs) regardless of what the rubric says

**Time:** 2-7 minutes
**Reviewers:** Security Specialist, Product Manager, Senior Architect, Technical Writer (agent team with collaborative discussion)
**Model:** Opus for all reviewers (more thorough reasoning)

*Note: `/review-pr` will auto-escalate to the team tier when triage flags high-risk paths. You don't need to invoke `/review-pr-team` just to "be safe" — the dispatcher handles that.*

---

## How `/review-spec` Works

**Three reviewers analyse the spec independently, then debate:**

1. **Requirements Auditor** — completeness: edge cases, error states, missing flows, undefined behaviour
2. **Technical Skeptic** — feasibility: DB implications, blast radius, hidden complexity, integration risks
3. **Devil's Advocate** — strategy: is this the right thing to build? Simpler alternatives? Wrong assumptions?

**Phase 1:** Independent review — each reviewer reads the spec and relevant codebase context simultaneously
**Phase 2:** Collaborative discussion — reviewers share findings, challenge each other's conclusions, reach consensus
**Phase 3:** Synthesis — unified output with overall recommendation (APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION)

**Output goes to conversation** (not a PR comment) so you can act on it before writing any code.

**Recommendation guide:**
- **APPROVED** — Proceed with implementation
- **APPROVED WITH CONDITIONS** — Implementation can start once specific gaps are addressed
- **NEEDS REVISION** — Spec has blocking issues; revise before starting

```
/review-spec SPECIFICATIONS/07-new-feature.md
/review-spec 07-new-feature          # partial name also works
```

---

## How `/review-pr` Works

`/review-pr` is a **dispatcher**. It does not review the PR itself — it classifies risk first, then hands off to the reviewer (or team) best suited to the change. The goal: use the cheapest review that's still safe.

**The three phases:**

1. **Triage** — a lightweight classifier reads the PR's changed paths, size, and a couple of targeted greps (for secret-shaped strings and Supabase RLS keywords). It does not read file contents in depth. ~30 seconds on its own; adds ~30 seconds of overhead to the total review time quoted in the tier table above.
2. **Announce** — the dispatcher tells you the tier and rationale in plain language *before* spawning the reviewer, so you can intervene if it got it wrong.
3. **Review** — the appropriate reviewer runs, posts to the PR with the triage decision visible in the comment header, and a summary appears in chat.

### The triage rubric (summary)

| Signal | Tier |
|---|---|
| Supabase migration, RLS policy change, or any `*.sql` | **team** |
| Cloudflare D1 config (`wrangler.{toml,jsonc,json}`), D1 bindings (`[[d1_databases]]`), `.dev.vars*` | **team** |
| `package.json` or non-JS manifest (`Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`, etc.) changes | **team** |
| `.env*` files, CI workflows, `middleware.ts`, public API routes | **team** |
| `SECURITY.md`, `SECURITY.txt`, `.well-known/security.txt` | **team** |
| Build configs (`next.config.*`, `vite.config.*`, `Dockerfile`, etc.) | **team** |
| Secret-material files (`*.pem`, `*.key`, `*.p12`, `id_rsa*`, `.ssh/**`) | **team** |
| Secret-shaped strings in diff (vendor token formats: `sk-…`, `gh[pousr]_…`, `AKIA…`, PEM blocks, JWTs) | **team** |
| `.claude/**` changes touching `agents/` AND `skills/`, or >3 files | **team** |
| `.claude/**` smaller changes (agent or skill tweaks) | **standard** |
| Only docs, tests, CSS, or comment-only diffs (and small/medium size) | **light** |
| Lockfile-only changes without manifest changes | **standard** |
| Everything else | **standard** |

**Safety posture:** when the classifier is uncertain between two tiers, it picks the higher one. The same applies to tool failures — if `gh pr view` fails or the triage output doesn't parse, the dispatcher falls back to `team`. A false-positive `team` review costs tokens; a false-negative `light` on a risky change costs trust.

**`.claude/**` is never `light`** — changes to agent definitions and skill prompts modify how every future review runs, so the rubric treats them as MEDIUM at minimum.

**The full rubric** lives in [`.claude/agents/triage-reviewer.md`](../../.claude/agents/triage-reviewer.md) — edit it there if the defaults don't suit your project.

### What each tier actually does

**Light tier (2 reviewers, narrow scope):**
- `light-reviewer` — obvious bugs, typos, factual errors, accidentally committed debug/secrets, broken links, ABOUT headers on new code files
- `technical-writer` — temporal language in docs ("recently added", "now works by…"), REFERENCE/ currency, British English, headline capitalisation

Output is terse: either `✅ No issues` / `✅ Documentation: no issues`, or 1–3 specific comments.

**What the light tier explicitly does NOT catch** (by design — safety rests on accurate triage, not defence in depth):
- Architecture critique, design-pattern drift, or scalability concerns
- Performance analysis
- Missing tests or low coverage (triage confirmed the change is low-risk)
- Threat modelling or deep security review
- Dependency / supply-chain risk (triage catches this via HIGH paths)
- Cross-cutting documentation strategy beyond the narrow checks above
- Security-relevant *content* in ordinary `*.md` files — e.g. a README install snippet like `curl … | sh`, or a docs page describing an auth flow. The triage classifies these as LOW because the file extension is markdown and the path isn't a recognised security-policy location. (Path-based matches — `SECURITY.md`, `SECURITY.txt`, `.well-known/security.txt` — are now caught by the rubric and routed to team.) If you're touching arbitrary docs that describe security-relevant behaviour, run `/review-pr-team N` directly.
- Stale cross-references where the *target* doc was moved or deleted in a prior PR but the link isn't in the current diff. Light tier reads the diff only — it won't notice that an unchanged link in your file now points at a moved target.

If a change lands in `light` that deserves deeper review, the failure mode is *silent missed analysis*, not a wrong verdict — the user can always follow up with `/review-pr-team N` on the same PR.

**Standard tier (2 reviewers):**
- Full code review: quality, functionality, security, architecture, performance, testing, types, conventions
- Documentation review: REFERENCE/ currency, CLAUDE.md updates, ABOUT comments, no temporal language

Output format:
- ✅ **Well Done** – What's good
- 🔴 **Critical Issues** – Must fix (blocking)
- ⚠️ **Suggestions** – Should consider (not blocking)
- 💡 **Nice-to-Haves** – Optional improvements

**Team tier:** See the `/review-pr-team` section below.

---

## How `/review-pr-team` Works

**Agent team collaboration:**
1. Creates agent team with 4 specialised reviewers
2. **Phase 1: Independent Review** - Each reviews from their perspective
3. **Phase 2: Collaborative Discussion** - Reviewers debate, challenge, reach consensus
4. Posts synthesised findings with discussion highlights

**The four reviewers:**

**Security Specialist** 🛡️
- Authentication, authorisation, secrets
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
- REFERENCE/ currency and CLAUDE.md consistency
- ABOUT headers on new code files
- Temporal language ("recently added", "was changed"), British English, headline capitalisation
- Documentation completeness for new features

**Key difference from `/review-pr`:**
- Reviewers **actually discuss** findings with each other
- They **challenge** each other's severity assessments
- They **debate** tradeoffs and propose solutions together
- Lead synthesises collaborative insights (not just four independent reports)

**Output includes:**
- Team consensus on critical issues
- Documented disagreements (valuable signal)
- Discussion highlights (how debate changed ratings)
- Collaborative solutions that emerged

**Two-comment audit pattern (team tier only):** when team tier runs via the dispatcher, you'll see *two* PR comments — first a short triage marker (`Triage: team (auto-escalated)` + flagged paths), then a second larger comment containing the full team review. This is by design: the marker preserves the dispatcher's audit trail even if the team review later fails or is amended. Running `/review-pr-team N` directly skips the marker and posts only the full review.

---

## Usage Examples

### Running the default dispatcher
```bash
/review-pr 42
```

The skill will:
1. Classify risk (paths, size, secret-scan) — ~30 seconds
2. Announce the tier + rationale in chat so you can override if needed
3. Run the appropriate review (light / standard / team)
4. Post findings to the PR with the triage decision in the comment header
5. Summarise in chat with a recommendation

### Running Team Review
```bash
# For critical changes
/review-pr-team 42
```

The skill will:
1. Fetch PR #42 details
2. Gather project context
3. Create agent team (4 reviewers)
4. Reviewers independently analyse
5. Reviewers discuss and debate findings
6. Lead synthesises collaborative analysis
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
3. **Run `/review-spec`** if the feature is non-trivial
4. Implement with tests: `npm test && npx tsc --noEmit`
5. Create PR
6. **Run `/review-pr`** — the dispatcher picks the right depth automatically (light / standard / team)
7. Address feedback
8. Merge when approved

### Critical Changes Workflow

1. Create feature branch
2. Review specs and architectural guidelines
3. **Run `/review-spec`** — debate assumptions before writing a line of code
4. Consider using EnterPlanMode for complex features
5. Implement with comprehensive tests
6. Self-review: `git diff`, verify no secrets/debug code
7. Create PR with detailed description
8. **Run `/review-pr`** — for most critical changes the dispatcher will auto-route to team tier (Supabase, auth, deps, CI, secrets all trigger team). Use `/review-pr-team` directly only if you want to skip triage entirely.
9. Reviewers discuss findings collaboratively
10. Address critical issues and consensus concerns
11. Document decisions on split opinions
12. Merge when approved

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

**PR review agents:**
- `triage-reviewer.md` — used by `/review-pr` as the first step to classify risk and pick tier (Sonnet, cheapest pass)
- `light-reviewer.md` — used by `/review-pr` for the `light` tier (Sonnet, narrow-scope sanity check)
- `code-reviewer.md` — used by `/review-pr` for the `standard` tier (Sonnet, full default prompt)
- `technical-writer.md` — used by `/review-pr` light and standard tiers, and `/review-pr-team` (Opus in team tier; Sonnet elsewhere)
- `security-specialist.md` — used by `/review-pr-team` (Opus)
- `product-reviewer.md` — used by `/review-pr-team` (Opus)
- `architect-reviewer.md` — used by `/review-pr-team` (Opus)

**Spec review agents:**
- `requirements-auditor.md` — used by `/review-spec` (Opus)
- `technical-skeptic.md` — used by `/review-spec` (Opus)
- `devils-advocate.md` — used by `/review-spec` (Opus)

**Why separate files?** Agent definitions are reusable and evolvable independently from skill orchestration logic. Update reviewer behaviour once; all skills that use it benefit automatically.

---

**Note:** These skills use intelligent context discovery - they automatically find and read relevant SPECIFICATIONS/ files based on PR keywords. Keep specs up-to-date for best results.

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
- Lead synthesises collaborative findings

**See:** [Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams)
