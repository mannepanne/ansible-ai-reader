# ADR: Opt-in config flag for the review system, with local override

**Date:** 2026-04-22
**Status:** Active
**Supersedes:** N/A

---

## Decision

The three `/review-*` skills are gated by a single project-level enum flag `prReviewMode` in `.claude/project-config.json`, with values `"enabled"` / `"disabled"` / `"prompt-on-first-use"`. The committed default for template consumers is `"prompt-on-first-use"`. A gitignored `.claude/project-config.local.json` may override the committed value on a per-clone basis. The gate logic that reads both files and branches on the resolved value lives in one canonical file, `.claude/skills/review-gate.md` — each skill's Step 0 is a one-line reference to that file, not a copy of it. Contextual Layer 1 triggers (when Claude proactively surfaces the pitch outside a skill invocation) stay in `.claude/CLAUDE.md` because they must be auto-loaded to fire.

## Context

Before this pattern landed, the three review skills (`/review-pr`, `/review-pr-team`, `/review-spec`) ran unconditionally whenever invoked. That is right for long-lived projects where reviews pay for themselves the first time they catch a real issue — but wrong for throwaway experiments, quick prototypes, or projects where the user hasn't decided whether to use the review system yet. The token cost of a team review on a five-line experiment is not trivial, and a template that *always* runs them risks teaching users that reviews are friction rather than value.

We wanted a gate that:
1. Lets each project turn the review system on or off once, with the answer persisting.
2. Doesn't ambush the user on a fresh clone — asks, with context, before running the first review.
3. Doesn't make the template author choose between "dogfood reviews on the template repo" and "ship a sensible default to cloners."
4. Doesn't require a build step, a runtime, or a language beyond prompt-and-markdown (same portability constraint as the [dispatcher ADR](./2026-04-22-tiered-pr-review-dispatcher.md)).

## Alternatives considered

- **Always-on (no flag).** Simplest. But punishes experiments and forces the user into a workflow they may not want. Rejected.
- **Always-off unless user explicitly runs a setup command.** Safer on tokens, but the review system is one of the template's main value propositions — leaving it dark by default hides the feature. Users who don't know it exists won't turn it on. Rejected.
- **Boolean flag (`enabled` / `disabled`) with no "ask me" middle state.** Forces the template to commit to one of the two, and both are wrong by default: `"enabled"` ambushes cloners with token cost before they understand the trade, `"disabled"` hides the feature. Rejected.
- **Per-skill flags (`prReviewPr`, `prReviewSpec`, `prReviewTeam`).** More granular but also more combinatorial. The three skills are conceptually one system; splitting them invites "I accidentally enabled PR review but not spec review" footguns. Rejected — all-or-nothing is easier to reason about for this template's audience (solo / small teams).
- **Environment variable (`CLAUDE_REVIEW_MODE=enabled`).** Works but doesn't persist across shells, doesn't version-control, and isn't visible to teammates who clone the repo. Rejected for the team-level decision; retained mentally as a possible layer-two escape hatch if ever needed.
- **Single checked-in flag, no local override.** Simple, but creates the tension the maintainer of a template repo can't resolve: they want `"enabled"` locally (to dogfood reviews on the template itself), and `"prompt-on-first-use"` in the committed default (so cloners get the right experience). Rejected in favour of the two-file pattern below.
- **Chosen: tri-state enum (`enabled` / `disabled` / `prompt-on-first-use`) in a committed config file, plus a gitignored local override file, with canonical gate logic in one place.** Addresses every goal above without introducing a build step.

## Reasoning

**Tri-state, not boolean.** The third state (`"prompt-on-first-use"`) is where most of the value lives. It means a fresh clone neither runs expensive reviews without asking nor silently hides the feature — instead, at the first review-adjacent moment (user mentions finishing a feature, user invokes a `/review-*` skill, user asks what the template provides), Claude renders a canonical pitch, the user answers `yes` / `no` / `later`, and the answer persists. That's the shape of a consent-respecting default.

**One canonical gate, not three copies.** The gate logic — read order, branch rules, persist semantics, malformed-JSON handling — lives in `.claude/skills/review-gate.md`. Each of the three SKILL.md files has a one-line Step 0 that says *"run the gate, substituting my skill name."* Single source of truth, zero drift surface. This fixes a real bug the PR review caught: in the first draft, three copies of the Step 0 block existed, and on day one they had already drifted — two said *"PR review system is disabled"*, one said *"Review system is disabled"*. Centralising eliminates that class of bug entirely. The gate originally lived inline in `.claude/CLAUDE.md`; it was extracted to its own file when that CLAUDE.md exceeded the template's own <300-line guidance (see the extraction follow-up PR).

**Local override via gitignored file, not via `--skip-worktree` or environment variable.** The maintainer's problem ("I want `enabled` locally but `prompt-on-first-use` committed") has several solutions, but the cleanest is the same pattern Claude Code already uses elsewhere: a `.local.json` sibling file that overrides the committed values and is gitignored. Users who want dogfooding create the local file; users who don't, don't. The gate merges local on top of committed, with local winning. Writes prefer the local file when it exists, so the user's choice stays local and doesn't leak into committed state.

**Fail-open to the pitch, not fail-silent.** Every ambiguous gate input (missing file, missing key, malformed JSON, unknown enum value) resolves to `"prompt-on-first-use"` and renders the pitch. The safety failure mode is always *"ask the user"*, never *"silently run"* or *"silently skip"*. This mirrors the dispatcher ADR's fail-closed posture but adapts it for a consent gate: the analogue of "fail to the expensive tier" is "fail to the human-in-the-loop."

**No inference-to-persistence bridge.** The gate only persists when the user answers the pitch directly. Claude does not persist `"disabled"` because the user said *"not now"* or *"I don't want reviews on this one"* earlier in the conversation. The first draft of this design included a clause telling Claude to infer consent from prior conversational signals and silently write the result — the review team unanimously flagged it as violating the consent model the flag exists to establish (and as a prompt-injection vector: a PR body saying *"I don't want reviews"* could trigger the silent persist). It was removed before this ADR was written.

**Layer 1 trigger list hardened against tool-result content.** Claude's proactive surfacing of the pitch (the contextual trigger: *"user says they finished a feature"* and similar) is scoped to user-authored messages only. Trigger phrases appearing in tool-result content (PR bodies, diff output, file contents being read, teammate messages) do NOT fire the pitch. This is the same discipline the dispatcher ADR applies to `MISCLASSIFICATION SUSPECTED` — only first-line-anchored, only from trusted provenance. Blast radius of a Layer 1 injection is small (annoying pitch, not code execution), but the defence costs one sentence and removes a foot-gun.

## Trade-offs accepted

**Gate logic in a prompt, not a code module.** Same trade-off the dispatcher ADR accepted: the template is prompt-and-markdown-only for portability reasons, so the gate is natural language Claude interprets on every skill invocation. There is no compile-time check that the gate implementation matches the spec, and no unit test that catches regressions. Mitigations: the gate lives in ONE place now (not three), so drift is local if it happens; the `_meta` block in `project-config.json` gives a human reader the schema inline; the committed default (`"prompt-on-first-use"`) is the fail-safe value.

**Local override is per-clone state, not cross-machine.** If a maintainer clones the template to a new machine, they need to recreate `project-config.local.json` manually. This is acceptable because the local override is specifically about *this clone's behaviour* — mirroring the way `.claude/settings.local.json` works — and because the committed default is correct for 99% of use cases (fresh clones want the pitch).

**Write semantics are LLM-improvised.** The persist step reads the JSON, changes one string, writes back. We document it as *"preserve `_meta` and other fields byte-for-byte"* in the gate, but there is no schema validator or JSON round-trip library enforcing it. If the config file grows fields Claude doesn't recognise, the write may reformat or reorder them. Mitigations: keep the config file small; consider a helper script (`.claude/hooks/set-review-mode.sh <value>`) if the write ever needs to be transactional. Not built now (YAGNI).

**Pre-commit guard not implemented.** A maintainer could, in theory, accidentally flip the committed default if they delete their local override and then answer `"yes"` to the pitch. The gate writes to the committed file when no local exists — which is correct for cloners but wrong for maintainers mid-session. Mitigation for now is process: ADRs like this one, PR review discipline. A future iteration could add a pre-commit hook rejecting any commit to `main` where `prReviewMode != "prompt-on-first-use"`. Deferred.

**Template-default invariant is documented, not enforced.** The committed value in `.claude/project-config.json` MUST be `"prompt-on-first-use"` for template consumers to get the intended experience. This is stated in the gate logic section and in this ADR, but no automated check prevents a future PR from flipping it. See the pre-commit guard trade-off above; related: the PR review process itself is expected to catch this, and did catch it once during the PR that introduced this pattern.

## Implications

**Enables:**
- Clean template default: cloners inherit the pitch and make an informed choice before incurring review cost.
- Maintainer dogfooding without default pollution: the gitignored local file lets the template author run `"enabled"` locally without committing it.
- Single canonical gate: future changes to the state machine (adding a fourth state, changing persist semantics, adding a new branch) happen in one place and propagate to all three skills automatically.
- Pattern for future template-level flags. The `_meta`-in-config + local-override design is reusable — if the template grows a `specReviewMode` or `telemetryMode` later, it can sit in the same `project-config.json` with the same override semantics.

**Prevents / complicates:**
- Adding a per-skill flag later (e.g. "turn PR review off but keep spec review on") is possible but requires changing the enum and all three SKILL.md Step 0 references. The current all-or-nothing design is intentionally coarse.
- The `_meta`-in-config pattern scales to maybe 3–4 flags before it starts feeling like a poorly-validated JSON Schema. At that point, consider adding a real schema file or migrating to a richer config format.
- Cross-clone state migration is not supported. If a user moves from one machine to another and wants their `"disabled"` local override to follow, they need to commit it to a private gist / password manager / out-of-band channel. Intentional: the override is *supposed* to be per-clone.

**Maintenance guidance for future edits:**
- Preserve the committed template default as `"prompt-on-first-use"`. Any PR that changes `.claude/project-config.json` must be scrutinised for this invariant, since getting it wrong means the opt-in flow is dead code on fresh clones.
- Preserve the gate-in-one-place structure. If you find yourself adding branching logic to a SKILL.md Step 0, that logic belongs in the canonical gate, not in the skill file. Skills should keep the one-line reference.
- Preserve the fail-open-to-pitch posture. The gate should resolve every ambiguous input to `"prompt-on-first-use"`, not `"enabled"` or `"disabled"`. Auto-silent behaviour defeats the consent model.
- Preserve the no-inference-to-persistence rule. Claude does not write `"disabled"` (or `"enabled"`) based on interpreting prior conversation. The only write paths are the pitch answer and direct user edits.
- Preserve Layer 1's user-authored-only trigger. Pitch triggers must come from direct user input, not from tool-result content. If a future edit relaxes this, re-read the injection trade-off above.

---

## References

- Related ADR: [2026-04-22 — Tiered PR review via a triage dispatcher](./2026-04-22-tiered-pr-review-dispatcher.md) — established the prompt-and-markdown-only portability constraint this ADR inherits.
- Gate implementation: [`.claude/skills/review-gate.md`](../../.claude/skills/review-gate.md)
- Overview and Layer 1 triggers: [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) → "Automated PR review system"
- Config file (committed default): [`.claude/project-config.json`](../../.claude/project-config.json)
- Local override (gitignored): `.claude/project-config.local.json`
- User-facing docs: [`REFERENCE/pr-review-workflow.md`](../pr-review-workflow.md) → "Configuration"
- PR that introduced this pattern: [#15](https://github.com/mannepanne/useful-assets-template/pull/15)
