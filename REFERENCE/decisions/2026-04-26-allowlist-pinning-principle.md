# ADR: Pin allow-list rules to subcommands when binaries can evaluate code

**Date:** 2026-04-26
**Status:** Active
**Supersedes:** N/A

---

## Decision

When adding entries to `.claude/settings.json`'s `permissions.allow` array:

- **Pin to a specific subcommand or invocation shape** when the underlying binary has any way to evaluate user-supplied code (`-c`, `-e`, `-m <anything>`, package install with arbitrary post-install scripts, etc).
- **Allow at the binary level** (`Bash(<binary>:*)`) only when the binary is a pure data transformer with no shell-out, no code-eval flags, no file-write capability, no network egress.

This is the rule for deciding the granularity of every new allow-list entry. The threat-model ADR ([`2026-04-25-pr-review-threat-model.md`](./2026-04-25-pr-review-threat-model.md)) sets the *posture* (we trust the contributor, the allow-list is for UX not defence); this ADR sets the *granularity* (where each individual rule should be drawn).

## Context

Allow-list entries are accumulating across categories: review tooling, test/typecheck/lint commands, JSON validation tooling. Each addition raises the same question — should the rule pin to the specific shape Claude reaches for, or allow the binary broadly so flag variants and pipe-shapes also silence?

The right answer differs per binary, and the reasoning should be stable across additions. Without an explicit principle, every new tool becomes a fresh debate ("is `Bash(jq:*)` safe?", "what about `Bash(node:*)`?"), and without a documented rule a future maintainer might broaden a rule that *looks* safe but admits arbitrary code execution. The risk isn't theoretical — `Bash(python3:*)` looks fine until you remember `python3 -c "import os; os.system(...)"`.

## Alternatives considered

- **Always pin narrowly to specific subcommand + flag shape** — Why not: produces verbose allow-lists with many redundant entries for binaries that genuinely have no escape hatch (`jq`, `cat`, `wc`, `sort`). Pays a maintenance cost (more lines, more pipe-variants per binary) for binaries where the pin adds no security.
- **Always allow broadly at the binary level** — Why not: silently permits arbitrary code execution via `python3 -c`, `node -e`, `bash -c`, `perl -e`, etc. The class of vulnerability the allow-list exists to prevent.
- **Case-by-case, no documented rule** — Why not: every contested entry becomes a fresh argument. Future maintainers (Claude or human) re-derive the principle from first principles, sometimes wrongly. The threat-model ADR exists because the *opposite* problem (no documented posture) caused exactly this pattern previously when reviewer-agent calibrations were debated; the same fix applies one level down.
- **Chosen: Pin when the binary can eval code; allow broadly when it can't** — captures the actual risk delineation, scales to new tools, gives future maintainers a one-question test ("does this binary have a `-c`-equivalent?").

## Reasoning

**The risk lives at the binary level, not the file level.** What an allow-list rule is actually permitting is "Claude may invoke this command without prompting." If the command itself has no way to escape its own scope (no shell-out, no `eval`-equivalent, no module import, no file write), the worst it can do is misbehave on the data it's given. If it *does* have an escape hatch, the rule is effectively allowing whatever-Claude-wants — the wildcard in the rule is incidental.

**The test is one question:** *Can a user (or a prompt-injected document Claude reads) supply input that the binary will execute as code?* If yes → pin to subcommands. If no → binary-level allow is fine.

**Worked examples:**

| Binary | Eval escape? | Allow at | Why |
|--------|-------------|----------|-----|
| `python3` | Yes — `-c`, `-m <module>`, pip post-install | Subcommand only (`python3 -m json.tool:*`) | `-c "import os; os.system(...)"` is full RCE |
| `node` | Yes — `-e`, `--eval`, `npm install` post-install | Subcommand only | Same shape as Python |
| `bash` / `sh` | Yes (definitionally) | Never broadly | The whole point of the binary is arbitrary execution |
| `perl` / `ruby` | Yes — `-e` | Subcommand only | Same shape as Python |
| `jq` | No — pure JSON-in / out-or-text-out, no shell-out | Binary level (`jq:*`) | No mechanism to escape its sandbox |
| `git` | Mixed — most subcommands safe, some have hooks/aliases that can run code | Subcommand-pinned in practice | Already what the file does (`git fetch *`, `git -C * log *`, etc) |
| `gh` | No (the binary itself is an API client) | Subcommand-pinned for UX clarity, but binary-level would be safe-ish | Pinned in current file — fine to leave |
| `curl` / `wget` | No code-eval, but **network egress + arbitrary file writes** | Narrow URL/destination patterns only | Different risk axis — not RCE but exfiltration / write-where-you-shouldn't |
| `grep` | No — pure pattern matcher, no `-e`-as-eval, no shell-out | Binary level (`grep:*`) plus `Bash(grep * ; echo *)` sibling for the exit-code workaround | Common enough to need an explicit rule; semicolon-echo sibling silences the `grep ... ; echo "exit=$?"` disambiguation pattern |
| `cat`, `head`, `tail`, `sort`, `wc`, `uniq` | No | Binary level safe; in practice already covered by Claude Code defaults | — |

**The pipe siblings are orthogonal to this principle.** Pipe-aware rules (`Bash(jq * | tail *)`, `Bash(node_modules/.bin/vitest * | tail *)`) exist because the matcher evaluates the full compound command — they're a *matcher* concern, not a *security* concern. Adding pipe siblings to a binary-level-allowed safe binary is fine; adding them to a subcommand-pinned binary requires extending the pin (`Bash(python3 -m json.tool * | tail *)`, not `Bash(python3 * | tail *)`).

**`curl` / `wget` are a third category and need their own ADR if/when they're added.** The risk axis is different (network egress, arbitrary file writes), not code execution. They should be pinned to URL patterns and output destinations, not added at the binary level. Out of scope for this ADR; flagged here so the principle isn't mistakenly applied to them.

## Trade-offs accepted

- **More lines in the allow-list for code-eval-capable binaries.** `python3 -m json.tool` requires four entries (bare, `> /dev/null`, `&& echo`, both combined) where `jq:*` is one. Accepted: the verbosity buys actual security; the alternative is RCE.
- **Future tools require the one-question test.** Every new addition needs five seconds of thought ("does this binary have a `-c`?"). Accepted: that thought is the *point* of the principle. Without it, the question doesn't get asked at all.
- **Some pin/allow choices are judgement calls at the margin.** `gh` is technically pinnable but probably safe binary-level too; `git` has obscure hooks that make perfect pinning hard. Accepted: the principle gives a default direction, not a mechanical rule. When unsure, pin narrower — easy to broaden later, hard to retract a broad rule that something already depends on.

## Implications

**Enables:**
- A consistent reasoning anchor for every new allow-list addition.
- Migration packets that document not just *what* rules to add but *why each is at its chosen granularity*, so derivative projects audit against the same principle.
- Future tooling additions (likely candidates: `prettier`, `eslint`, `tsc` as a binary, `markdownlint`, language-specific test runners) follow the table without a fresh debate.

**Prevents/complicates:**
- Cannot ship a "convenience" rule like `Bash(python3:*)` even when the immediate use case is benign. The rule outlives the use case; the broad form silently admits future invocations the original author didn't picture.
- A future maintainer broadening a subcommand pin to a binary-level allow needs to apply the one-question test deliberately, not by reflex. This ADR is the anchor that surfaces the question.

---

## References

- [2026-04-25 — PR review threat model](./2026-04-25-pr-review-threat-model.md) — sibling ADR; sets the trust posture this ADR operates inside.
- [`.claude/settings.json`](../../.claude/settings.json) — the file this principle governs; the inline `_comment` field there is a one-line pointer back to the threat-model ADR; this ADR is the granularity companion.
- [`REFERENCE/TEMPLATE-UPDATES/2026-04-threat-model-and-safety-harness/README.md`](../TEMPLATE-UPDATES/2026-04-threat-model-and-safety-harness/README.md) — the migration packet that ships these allow-list entries to derivative projects; its manifest description references this principle when documenting the validation-tooling group.
