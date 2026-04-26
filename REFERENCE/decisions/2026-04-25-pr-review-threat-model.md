# ADR: PR review system assumes a solo trusted contributor

**Date:** 2026-04-25
**Status:** Active
**Supersedes:** N/A

---

## Decision

The PR review system (`/review-pr`, `/review-pr-team`, `/review-spec`) and its supporting allowlist in `.claude/settings.json` are calibrated for a **single trusted contributor** working on personal projects, or a small team of mutually-trusted contributors who know each other personally. Permissions and reviewer-agent severity ratings reflect that assumption. Derivative projects whose contributor model differs are expected to tighten — see the *Tightening checklist* below.

This ADR is the canonical reference for "what threat model do we assume" anywhere the question comes up: the `permissions.allow` block in settings.json, reviewer agent definitions, future skill design.

## Context

The template ships an automated PR review system that runs reviewer subagents against pull requests. Those subagents need bash access to inspect the repo (`git show`, `gh pr diff`, `grep`, etc.). Each bash invocation either auto-allows under Claude Code's built-in rules, matches a `permissions.allow` entry, or prompts the user.

When PR 19 first attempted to silence the recurring approval prompts that fire during a review, the team review of that PR flagged several allowlist entries as "RCE-shaped" — wildcards admit `git fetch --upload-pack=<cmd>`, GNU sed's `e` script command, etc. The blockers assumed the worst-case threat model: open-source template, hostile contributors, prompt-injected PR descriptions weaponising the allowlist.

That threat model is wrong for the actual usage pattern. The template's user is a solo contributor on personal projects. Every PR is self-authored or co-authored with their own AI pair. The contributor already trusts Claude Code with bash access on their machine; the allowlist is not the last line of defence. Reviewing the PR through the lens of "RCE via hostile committer" produced expensive, theoretical findings and obscured the real correctness issues.

This ADR fixes that by stating the assumption explicitly. Future reviews calibrate against it. Future maintainers — Claude or human — read this rather than re-deriving the threat model from first principles.

## Alternatives considered

- **Default-pessimistic threat model** ("assume hostile contributors, tight allowlist, every wildcard is suspect") — Why not: produces theoretical-RCE findings that don't apply to the actual usage pattern, and the friction (manual approval prompts on every safe operation) makes the AI-assisted review flow unusable. The template's *purpose* is to make solo-AI-pair work smoother; a defensive posture that fights that purpose is the wrong default.

- **No documented threat model, decide case by case** — Why not: every contested allowlist entry becomes a debate. The team review of PR 19 surfaced this directly: without a stated threat model, reviewers default to worst-case, the lead defaults to "ship the friction-free version," and the disagreement has no anchor. An ADR resolves this once.

- **Per-environment threat models** (different defaults for `local-dev`, `team-shared`, `public-os`) — Why not: over-engineered for a personal-project template. Adding mode switches and conditional defaults adds complexity that 99% of users never need. Cleaner: pick a default, document the assumption, give other use cases a tightening checklist.

- **Chosen: Solo-trusted-contributor as the explicit default** — calibrate permissions, reviewer severity, and conventions against that scenario; document the boundary clearly; provide an opt-in tightening path for derivatives whose use case differs.

## Reasoning

**Match the threat model to the actual user.** The contributor profile is unambiguous: a single person, working alone or with a small trusted team, generating their own PRs (typed directly or co-authored with Claude Code). Not strangers contributing to an open-source project. Not corporate teams with mixed trust levels. Not regulated environments. The ergonomics this design optimises for are the ones the contributor actually experiences daily.

**Trust is upstream of the allowlist.** Claude Code already has bash access to the contributor's machine. If the contributor doesn't trust Claude Code, they shouldn't be using it; the allowlist isn't a meaningful additional defence. What the allowlist *does* control is UX friction — prompting on safe operations is annoying without being protective. Calibrating the allowlist for the actual trust relationship instead of an imagined one is honest.

**Where reviewers run vs. where production runs is different.** The PR review skills run on the contributor's local machine. They are not the place to defend the deployed application — that's CI/CD's job, with its own security model (Actions secrets, runner isolation, branch protection rules). Conflating the two leads to either flooding local UX with production-grade prompts (the PR 19 first-iteration problem) or weakening production security to match local ergonomics (the wrong direction). Keeping the threat models separate keeps each calibrated correctly.

**Reviewer agents need calibration too.** The `security-specialist` agent currently defaults to "all attackers including malicious committers." Under this ADR, it should distinguish:
- **In scope** (keep vigilant): production-runtime exposure — users hitting the deployed app, internet attackers, secrets leaking into repo history, malicious upstream packages, SQL injection, RLS/auth bugs, XSS, IDOR, CSRF on state-changing endpoints, dependency adds. Anything exploitable from *outside* the project.
- **Out of scope by default**: attacks that require a malicious committer — RCE via PR-content prompt injection, backdoors in test code, hostile migrations. Note as "out-of-scope per threat model" with a one-line tightening pointer, rather than as blockers.

**Document the boundary loudly so derivatives can opt in to tighter.** The risk is that someone clones the template into a use case where the threat model is wrong (open-source repo, multi-team project), inherits the permissive defaults, and gets bitten. The mitigation is the *Tightening checklist* below — short enough to scan, specific enough to act on, anchored from settings.json so a derivative-project owner sees it at the moment they're configuring permissions.

## In scope (these defaults are designed for)

- Single trusted contributor on personal projects.
- Small teams of mutually-known, personally-trusted contributors (every committer is someone you'd hand a key to).
- Reviews running on the contributor's own machine, not in shared infrastructure.
- PRs authored by the contributor themselves, possibly with Claude Code as pair.

## Out of scope (these defaults are NOT for)

- Open-source projects accepting PRs from strangers or unknown contributors.
- Corporate or team projects where committers may be unknown, untrusted, or potentially adversarial.
- Compliance regimes that demand defence-in-depth (SOC 2, ISO 27001, regulated industries).
- Automated CI/CD pipelines running reviews on adversarial input without a human gate.
- Multi-user systems where /tmp symlink attacks or local privilege escalation between users matters.

If your usage matches anything here, follow the tightening checklist before relying on these defaults.

## Sub-cases within in-scope: experience level shifts safety defaults

The in-scope profile above is silent on *experience level*. Two design points exist within scope, and they need different safety defaults even though both are equally trusted:

- **Experienced user.** Comfortable with shell, recognises destructive commands by sight, knows recovery mechanisms (`git reflog`, Time Machine, etc.). Unlikely to fat-finger; able to recover quickly if they do. Daily friction is the main cost — protective prompts on routine operations are pure noise.
- **Less-experienced user.** May not recognise destructive commands by sight, less likely to know recovery mechanisms, more likely to follow AI suggestions or error-message instructions without sanity-checking. Honest mistakes are both more frequent *and* more costly when they happen, and a destructive operation that lands cleanly often can't be undone after the fact.

These are not separate threat models — both are trusted contributors on personal projects. They differ in what the tooling needs to do *for* them.

**How the defaults split:**
- The PR review system (`/review-pr`, allowlist, reviewer-agent severity) is calibrated for the experienced-user case: silent execution on safe ops, hostile-committer attacks de-prioritised. This is correct because review-system friction hits *every routine operation*, and routine operations need to be silent.
- The safety-harness hook ([`REFERENCE/safety-harness.md`](../safety-harness.md)) is calibrated for the less-experienced-user case: catastrophic operations blocked, ambiguous-but-destructive operations prompt for user confirmation (`ask` tier), educational warnings flag risky-but-legitimate ops. This is correct because the harness fires *only on dangerous operations*, and dangerous operations are exactly where less-experienced users benefit most from a pause.

The two systems compose. The review allowlist controls UX friction on safe operations; the safety harness catches dangerous operations regardless of allowlist state. They live at different points in the call path and target different user states.

**Why call this out explicitly.** A future maintainer reading "single trusted contributor / silent execution / de-prioritise hostile committers" could reasonably conclude the safety-harness defaults are over-tuned and shrink them back. The reasoning is that **contributor experience is independent of contributor trust** — both sub-cases are equally in-scope, equally trusted, but they have genuinely different needs from the tooling. Don't shrink safety-harness defaults that are sized for the less-experienced case unless the project's contributor profile is verifiably experienced-only.

## Tightening checklist (for derivative projects whose use case differs)

If your project doesn't match the in-scope profile above, change these defaults *before* running reviews on contributor PRs:

1. **Tighten `Bash(git fetch *)`** to a fixed-remote, no-flag form (e.g. `Bash(git fetch origin *)`) so `--upload-pack=<cmd>` cannot reach a shell. Or drop entirely and accept one prompt per session.
2. **Drop any `Bash(git -C * …)` entries.** With multiple committers, the convention "use bare git, CWD is inherited" can no longer be assumed; force the prompt to surface unusual `-C` invocations.
3. **Drop any `Bash(git show * | sed *)` entries.** GNU sed's `e` command is RCE; on Linux/CI runners or any host with `gsed` installed, this is reachable.
4. **Audit reviewer agent prompts** — `security-specialist`, `triage-reviewer`, `code-reviewer` — and re-enable the "hostile committer" severity defaults. The shipped versions de-prioritise that scenario; you'll want it back.
5. **Consider running PR review skills only against PRs from trusted committers.** Reviewer subagents inherit the host's bash permissions; if the committer is potentially adversarial, the host running the review is the attack surface.
6. **Move secret-detection and RLS/auth review to CI** in addition to local review, so the deployed-app threat model gets coverage independent of the local-review threat model.
7. **Tighten the SCRATCH-write hook to resolve symlinks before approving.** `.claude/hooks/approve-scratch-write.sh` does textual prefix-matching against `$CLAUDE_PROJECT_DIR/SCRATCH/`, not `realpath`. Under solo-trusted-contributor that's fine; with a malicious committer or a multi-user host, a symlink inside `SCRATCH/` (or `SCRATCH/` itself being a symlink) escapes scope. Either add a `realpath`-equivalent normalisation step, or drop the hook entirely and accept the prompt. See [`REFERENCE/scratch-write-hook.md`](../scratch-write-hook.md) → "What's not caught" for the empirical exploit shape.
8. **Drop or pin the `Bash(git diff:*)` and `Bash(git log:*)` allow-list entries.** `git diff --ext-diff` and configured `diff.<driver>.command` / `textconv` filters in `.gitattributes` + `git config` can run arbitrary programs. `git log -p` inherits. With a malicious committer or a pre-configured hostile diff driver this is reachable. Tighten to fixed-flag forms (e.g. `Bash(git diff --no-ext-diff *)`) or drop and accept the prompt.

## Trade-offs accepted

**Permissive local defaults.** The allowlist and reviewer severity bias toward "let the contributor work without prompts" rather than "block on theoretical worst-case." This is correct for the in-scope use case and wrong for the out-of-scope ones; the out-of-scope cases are expected to follow the tightening checklist.

**Reviewer agents miss some classes of attack.** Specifically, attacks that require a malicious committer (PR-content prompt injection, backdoor in test code) are de-prioritised. Production-runtime security (the deployed app facing the internet) and supply-chain (dependency adds) remain in scope. If your threat model includes hostile committers, the tightening checklist re-enables those defaults.

**Documentation burden on derivative projects.** Anyone cloning the template into a use case the defaults don't fit needs to read this ADR and act on the checklist. We mitigate by referencing this ADR from settings.json's allowlist comment, from reviewer agent definitions where relevant, and from the template's onboarding docs — but ultimately a derivative-project owner who skips the docs and inherits unsuitable defaults is exposed.

**No automated check for "is your threat model the right one?"** A future iteration could ship a one-off setup script that asks the user about their contributor model and adjusts settings.json accordingly. Out of scope for now; documented assumption is enough for the v1.

## Implications

**Enables:**
- Solo-AI-pair workflow without recurring permission friction. Reviews run silently for the operations the contributor genuinely uses every day.
- Coherent severity ratings from reviewer agents — they stop firing theoretical-RCE alarms and focus on what's actually reachable in the in-scope threat model.
- A single anchor for "what threat model do we assume?" — anywhere the question comes up (settings.json comment, agent prompts, future skill design), the answer is "see this ADR."

**Prevents/complicates:**
- Direct adoption by projects whose threat model differs. Such projects need to follow the tightening checklist; this is documented but is real friction.
- Future "we should make the defaults safer" pressure — the answer is "the *defaults* are calibrated for the in-scope use case; if your threat model differs, the tightening checklist exists, but we don't shift the defaults wider because that breaks the ergonomics for everyone in scope." This ADR is the load-bearing artefact for that argument.

---

## References

- Related ADRs:
  - [2026-04-22 — Tiered PR review via triage dispatcher](./2026-04-22-tiered-pr-review-dispatcher.md) — the dispatch architecture this threat model calibrates
  - [2026-04-22 — Opt-in config flag for the review system](./2026-04-22-prreviewmode-opt-in-config.md) — adjacent: the *whether* of the review system; this ADR is the *how-strict*
- Anchor points in code/config:
  - `.claude/settings.json` `permissions.allow` — comment block references this ADR
  - `.claude/agents/security-specialist.md` — severity defaults reference the in/out-of-scope split (PR 21 onwards)
  - `.claude/agents/CLAUDE.md` — shared bash conventions section references this ADR for severity calibration
  - `REFERENCE/safety-harness.md` — how-it-works for the safety-harness hook (calibrated against the less-experienced-user sub-case introduced in this ADR); implementation history at `SPECIFICATIONS/ARCHIVE/pretooluse-safety-harness.md`
- Discussion that produced this ADR: PR 19 review thread on `mannepanne/useful-assets-template`
