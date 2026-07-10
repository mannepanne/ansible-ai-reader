# ADR: Reviewer agents are read-only, and PR reviewers run in an isolated worktree

**Date:** 2026-07-09
**Status:** Active
**Supersedes:** N/A

---

## Decision

Reviewer agents never mutate repository state. A shared read-only contract in [`.claude/agents/CLAUDE.md`](../../.claude/agents/CLAUDE.md#read-only-contract) forbids `git checkout`, `gh pr checkout`, `git switch`, `stash`, `restore`, `reset`, `merge`, `rebase`, and every other operation that moves `HEAD` or writes to a branch. To read a file as it exists on the PR branch, agents use `git fetch origin pull/<N>/head` followed by `git show FETCH_HEAD:<path>`.

In addition, every subagent spawned by `/review-pr` and `/review-pr-team` runs with `isolation: "worktree"`. `/review-spec` reviewers deliberately do not.

## Context

A downstream project ran `/review-pr`. The `code-reviewer` agent ran `git checkout` in the shared working tree to see the PR's files, silently moving the operator off the branch they were working on. Two subsequent commits landed somewhere unintended and nearly missed the PR. The operator caught it manually.

The root cause was not a missing prohibition. It was a **contradiction in the agent definitions**. Four PR-review agents said:

> Read full file context where needed using the Read tool

and justified it with:

> **Why gather your own context?** This ensures you see the LATEST committed state of all files.

The `Read` tool reads the **working tree**, not the PR. When the working tree is not on the PR head, `Read` returns whatever branch the operator happens to be on — so the second sentence is false, and an agent that notices the mismatch between the diff it fetched and the files it read will reach for `git checkout` to reconcile them. The agents were being pushed toward the footgun by their own instructions.

Meanwhile, `.claude/agents/CLAUDE.md` already prescribed `git show <branch>:<path>` for branch/revision files. The agents had simply drifted from a read-only convention that existed.

The template does not allowlist `git checkout` or `gh pr checkout`, so under default permissions the command would prompt. It ran **silently** in the downstream project, which means that project runs in a permissive mode or has broadened its git allowlist. The permission layer is therefore not a dependable defence.

## Alternatives considered

- **Add `git checkout` to `permissions.deny`, or an `ask` pattern in `safety-harness.sh`.**
  - Why not: permission rules and `PreToolUse` hooks are **session-wide**. Neither can distinguish a subagent from the operator's main session. This would nag or block the human's own constant branch-switching — the single most common git operation in the workflow — to defend against an agent. Wrong layer.

- **Restrict reviewer agents' `tools:` frontmatter to remove `Bash`.**
  - Why not: reviewers genuinely need `gh pr diff`, `gh pr view`, and `git show`. The frontmatter gates tool *names*, not individual shell commands, so this is all-or-nothing and would break context gathering entirely.

- **Fix the prompts only (read-only contract, corrected step 4).**
  - Why not sufficient on its own: it removes the pressure and forbids the action, which addresses the root cause. But it is a "should never", enforced by model compliance. The operator who reported this was bitten in a permissive session, and asked for "never".

- **Worktree isolation only.**
  - Why not sufficient on its own: it hard-stops the hazard but leaves the step-4 contradiction in place. Reviewers would keep reaching for `checkout` — harmlessly, inside their own worktree — doing pointless work, and the whole thing breaks the moment isolation is dropped.

- **Chosen: both layers.** The contract removes the cause; the worktree makes the failure mode unreachable. Neither is redundant: the contract is what makes the worktree cheap (nothing to clean up) and the worktree is what makes the contract safe to trust.

## Reasoning

**The two layers do different jobs.** The contract fixes *why* an agent reached for `checkout`. The worktree fixes *what happens* if one still does. Removing either leaves a real gap: contract-only depends on model compliance in a permissive session; worktree-only leaves agents doing wasted work against a latent trap.

**Worktree isolation is nearly free here precisely because reviewers are read-only.** A worktree that is never modified is auto-removed, so the ongoing cost is sub-second setup per agent. Isolation is normally reserved for agents that *write* in parallel and would conflict; here it is used inversely, as a containment wall around agents that must not write at all.

**`git fetch origin pull/<N>/head` is genuinely non-mutating.** It writes `FETCH_HEAD` (per-worktree) and object data. It creates no branch, moves no ref, and leaves the working tree untouched. Verified before adopting. It is already covered by the `Bash(git fetch *)` allowlist entry, so it stays silent.

**`/review-spec` is exempt, and that asymmetry is load-bearing.** Spec reviewers read a spec file in the operator's working tree, on the operator's branch — sometimes one that is not committed anywhere yet. A worktree would isolate them from the artefact under review. There is no PR branch and hence no `checkout` temptation. The contract alone covers them.

## Trade-offs accepted

**Reviewers can no longer `Read` a changed file directly; they must go through `git show FETCH_HEAD:<path>`.**
- Slightly more ceremony, one extra `git fetch` per agent.
- Accepted: it is the only form that is correct regardless of working-tree state. The previous form was correct only by accident, when the operator happened to be sitting on the PR branch.

**PR reviewers pay worktree setup cost on every run.**
- Sub-second per agent, and auto-cleaned.
- Accepted: trivially cheaper than one instance of the lost-work failure it prevents.

**The permission layer remains unable to distinguish subagents from the main session.**
- We are not fixing that; we are routing around it.
- Accepted: it is an upstream concern, and worktree isolation gives a stronger guarantee than a permission rule would anyway.

## Implications

**Enables:**
- A reviewer literally cannot move the operator's branch, regardless of permission mode
- Reviews are correct when the operator is on any branch, not just the PR's — including reviewing a PR while working on something else
- Reviewer agents become safe to run against a dirty working tree

**Prevents / complicates:**
- An agent that genuinely needs the working tree's state (none currently do) would have to be spawned without isolation, deliberately
- `Read` is no longer the one-size default for reviewer agents; the tool-invocation table now branches on whether the PR changed the file

---

## References

- Related ADRs:
  - [2026-07-09 — Reviewer agents fan out and report to an orchestrator](./2026-07-09-fan-out-review-synthesis.md) — the spawn sites this change adds isolation to
  - [2026-04-25 — PR review system assumes a solo trusted contributor](./2026-04-25-pr-review-threat-model.md) — why permission rules are calibrated for silence, and why they can't carry this defence
  - [2026-04-26 — Pin allow-list rules to subcommands when binaries can evaluate code](./2026-04-26-allowlist-pinning-principle.md) — the allowlist discipline that keeps `git fetch` silent while `git checkout` is not allowlisted
- Shared contract: [`.claude/agents/CLAUDE.md`](../../.claude/agents/CLAUDE.md#read-only-contract)
- Operations reference: [`REFERENCE/development/pr-review-workflow.md`](../development/pr-review-workflow.md)
