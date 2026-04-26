# ADR: Tiered PR Review via a Triage Dispatcher

**Date:** 2026-04-22
**Status:** Active
**Supersedes:** N/A

---

## Decision

`/review-pr` is a **dispatcher** that runs a cheap triage classifier first, announces the chosen tier in plain language, then delegates to one of three review tiers (`light`, `standard`, `team`). The rubric lives in `.claude/agents/triage-reviewer.md` as a prompt — not in code. `/review-pr-team` remains independently user-invocable; the dispatcher does not replace it.

## Context

Before this pattern landed, the project had a single review skill (`/review-pr-team`) that always ran a four-agent team on every PR. For docs-only PRs and small refactors this was wasteful — 5–10 minutes of Opus-tier analysis to find zero issues. For risky changes (Supabase migrations, auth middleware, CI pipelines) it was correctly rigorous.

We wanted to keep the deep review available for risky changes while avoiding the full cost on every docs fix. The straw-man options were:

1. Drop to a single-reviewer `/review-pr` (cheaper, but missed critical issues on risky PRs)
2. Keep only `/review-pr-team` (thorough, but expensive and slow on every PR)
3. Ask the user to pick manually each time (error-prone — wrong calls erode trust either way)

The pattern chosen below splits the difference.

## Alternatives considered

- **Always-team review (`/review-pr-team` as the only entry point):** Thorough but wasteful. 5–10 min Opus team on every typo fix. Friction discourages review as a habit. Rejected.
- **Single-reviewer `/review-pr` that always runs one agent:** Fast but uniform. Misses the cases where multi-perspective debate actually adds value (security × architecture × product trade-offs). Rejected.
- **User picks tier manually** (`/review-pr-light`, `/review-pr-standard`, `/review-pr-team` as separate skills): Zero overhead, but puts the classification burden on the user. Wrong calls will happen — and the failure mode is asymmetric (over-picking wastes tokens; under-picking misses risks). Rejected.
- **Hard-coded rubric in a TypeScript/JS dispatcher:** More deterministic, easier to unit-test, less prompt-drift risk. Rejected — adds a build step and a language runtime to a template that is otherwise prompt-and-markdown only. Template portability is load-bearing.
- **Chosen: prompt-based triage classifier + dispatcher skill:** A cheap Sonnet classifier reads paths/size/greps, emits a four-line classification block, and the skill routes based on the `TIER:` value. Rubric evolves as prose, not code.

## Reasoning

**Triage is a classification problem, not a review problem.**
The expensive part of a review is reading the diff in depth. The cheap part is looking at *which files changed* and applying a rubric. Splitting those phases means the expensive part only runs when warranted.

**Prompt-based rubric over code-based rubric.**
The template is a solo-dev workflow where editing a markdown file is friction-free but adding a build step is not. The rubric is also exactly the kind of thing that evolves by reading — "oh, we should also catch `Cargo.toml`" — so keeping it as prose in `.claude/agents/triage-reviewer.md` makes the evolution loop tight. Trade-off: no compile-time checks that the rubric is complete. Mitigation: a classifier that can hand-write arbitrary tier labels is why the dispatcher validates `TIER ∈ {light, standard, team}` and fails closed to `team` on parse errors (see below).

**Announce-before-spawn is the user's override lever.**
The dispatcher tells the user *"I classified this as light because X"* before running the reviewer. This is the only way the user catches mis-triage cheaply — without it, they pay for a wrong-tier review before noticing. The announce step also makes the classification auditable on the PR comment (it's in the header).

**Safety bias: fail-closed, tier UP, never down.**
On every ambiguity, the rule is the same: escalate. Two files match LOW + one matches HIGH → HIGH wins. Classification is unclear → pick the higher tier. Triage output doesn't parse → fall back to `team`. `gh pr view` fails → emit a team classification. The failure mode is always "waste tokens," never "miss a risk." This principle is load-bearing; a future edit that flips any of these to fail-open breaks the contract.

**`/review-pr-team` stays independent.**
The dispatcher *delegates* to `/review-pr-team` via the Skill tool for the team tier. It does not replace, wrap, or parameterise it. The team skill has no idea it's being orchestrated. This matters because:
- Users can still invoke `/review-pr-team N` directly to skip triage entirely
- The team skill's public contract (no extra arguments needed) stays simple
- Future edits to the team skill (new reviewers, different discussion protocol) don't need to know about the dispatcher

The cost of that independence is that the dispatcher can't pass the triage rationale *into* the team skill — hence the two-comment team-tier pattern (below).

**Dedicated `light-reviewer` agent instead of inline prompt overrides.**
The light tier's narrow scope (no completion-requirements checklist, no threat modelling, terse output) is baked into `.claude/agents/light-reviewer.md` rather than passed as prompt overrides on top of `code-reviewer`. Early versions used inline overrides — this was fragile: future edits to `code-reviewer.md` (adding new mandatory checks) would silently fail to propagate through the override pattern. A separate agent decouples light-tier scope from standard-tier scope cleanly.

## Trade-offs accepted

**Prompt-based rubric can drift.**
There's no compile-time enforcement that the rubric is complete or internally consistent. Mitigations: PRs that touch `.claude/**` auto-escalate to at least `standard`, and the "prompt-injection hardening" line in the triage agent explicitly instructs the classifier to distrust PR-description content that tries to lower the tier.

**Two PR comments per team-tier review.**
The team tier posts a separate "triage marker" comment before `/review-pr-team`'s own output. This is workaround-shaped, but preserves two properties worth keeping:
- Audit trail resilience — if the team skill crashes mid-run, the triage classification is still recorded
- Team skill independence — no need to parameterise it with a header string

The alternative (merging triage into `/review-pr-team` or adding a header parameter) trades audit resilience and public-contract simplicity for visual tidiness. Judged not worth it.

**String-parsed classification is brittle.**
`TIER:` / `RATIONALE:` / `FLAGGED_PATHS:` / `SIZE:` lines are parsed as strings. A classifier returning prose instead of the block would break dispatch. Mitigation: the fail-closed fallback in `SKILL.md` Step 1 — if parsing fails or `TIER` is out-of-vocabulary, default to `team` and announce it.

**Light tier is narrow by design — it will miss things.**
Architecture critique, performance analysis, deep security review, and full test-coverage checks are all explicitly skipped at light tier. The safety of this rests on accurate triage. If triage misclassifies a risky PR as LOW, the light tier will not catch what the right tier would. This is an accepted risk, documented in `REFERENCE/pr-review-workflow.md` under "What the light tier explicitly does NOT catch."

**Regex-based secret detection has edges.**
The triage rubric uses grep patterns for modern token shapes (`sk-…`, `gh[pousr]_…`, PEM blocks, JWT structure, AWS keys) plus keyword-anchored patterns. It cannot catch every secret format ever invented, and it will produce false-positives on docs that *describe* secrets (tier-up — harmless). Accepted: the rule's purpose is tier-escalation, not content redaction; false-positives are the safe failure mode.

**Misclassification user-defer is a deliberate exception to the fail-closed posture.**
Everywhere else in the dispatcher, ambiguity escalates: parse errors → `team`, tool failures → `team`, tier ambiguity → UP. One path does not follow this rule. When `light-reviewer` emits `MISCLASSIFICATION SUSPECTED:` (a valid, first-line-anchored signal with a reason sentence), the dispatcher *stops and surfaces the reason to the user* rather than auto-escalating to team tier. This exception is load-bearing for two reasons:

1. **User cost preference.** The user chose `/review-pr` over `/review-pr-team` — they expressed a preference for the cheaper path. Auto-escalating past that preference based on a signal consumes team-tier tokens the user didn't ask for.
2. **Signal provenance.** The misclassification signal originates from a reviewer that reads untrusted PR content (title, description, diff). Even with the hardened untrusted-input contract in `.claude/agents/CLAUDE.md`, a belt-and-braces stance treats this specific signal as "prompt the user" rather than "trigger expensive action automatically." Auto-escalating would give an attacker who forged the signal (despite the hardening) the ability to burn the user's team-tier budget at will.

Contrast with the other fail-closed paths: parse-failure and `gh`-failure fire on *tool errors*, not on model judgement. They fill gaps the user didn't choose; they don't override a user preference. If a future editor is tempted to "make the misclassification path consistent with the rest" — re-read this bullet. The exception is intentional.

## Implications

**Enables:**
- Right-sized review cost per PR — docs-only PRs are done in ~1 minute, risky PRs still get the full team.
- Transparent classification decisions — every review comment shows the triage tier and rationale, which users can inspect and override.
- Simple rubric evolution — add a new HIGH-tier path pattern or secret regex by editing the markdown, no build step.
- Independent skill lifecycle — `/review-pr-team` can evolve without coordinating with `/review-pr`.

**Prevents / complicates:**
- Harder to unit-test the rubric (prompt vs code). Mitigation: clear examples in the agent definition, and worked examples in the Rubric section.
- Adding a 4th tier later (e.g. an intermediate "security-only" tier) requires editing both `triage-reviewer.md` (rubric) and `SKILL.md` (routing). Two-file coupling, not worse than any other parallel-branch dispatch.
- Users who clone this template inherit the trade-offs above without necessarily reading this ADR — the rubric may feel under-featured on a codebase with different risk surfaces. The rubric is designed to be edited in-place; cloners should tune the HIGH-tier paths to match their stack.

**Maintenance guidance for future edits:**
- Preserve the fail-closed safety bias. If you touch the dispatcher fallback rules, err on the side of escalation.
- Preserve `/review-pr-team` as a standalone user-invocable skill. Do not inline it into `/review-pr`.
- Preserve the two-comment audit pattern for the team tier. If you're tempted to "clean it up" by merging the marker into the team-review comment, re-read the Trade-offs section above — the separation is why the marker survives mid-run crashes.
- Preserve the dedicated `light-reviewer`. If you reintroduce prompt-level overrides on top of `code-reviewer`, you take on the coupling problem this ADR was written to avoid.

---

## References

- Agent definition: [`.claude/agents/triage-reviewer.md`](../../.claude/agents/triage-reviewer.md)
- Agent definition: [`.claude/agents/light-reviewer.md`](../../.claude/agents/light-reviewer.md)
- Dispatcher skill: [`.claude/skills/review-pr/SKILL.md`](../../.claude/skills/review-pr/SKILL.md)
- Team review skill: [`.claude/skills/review-pr-team/SKILL.md`](../../.claude/skills/review-pr-team/SKILL.md)
- User-facing workflow guide: [`REFERENCE/pr-review-workflow.md`](../pr-review-workflow.md)
- PR that introduced this pattern: [#13](https://github.com/mannepanne/useful-assets-template/pull/13)
