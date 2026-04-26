# Safety harness — `PreToolUse` hook

A guardrail against honest mistakes on the Bash tool. Two tiers:

- **Block** — catastrophic operations are stopped before they execute. The user sees a one-line reason and an inline-bypass instruction.
- **Ask** — destructive-but-sometimes-legitimate operations surface a permission dialog. The user approves or denies. The AI cannot see or auto-answer the dialog.

Calibrated for less-experienced users per [`REFERENCE/decisions/2026-04-25-pr-review-threat-model.md`](./decisions/2026-04-25-pr-review-threat-model.md) (the *Sub-cases within in-scope* section). Honest mistakes — yours or an AI's — are the threat. Adversarial users are out of scope.

---

## What's caught

### Block tier — these commands do not run

| Pattern | Reason |
|---|---|
| `rm -rf` against `/`, `~`, `$HOME`, `/Users` | Catastrophic filesystem destruction |
| `rm -rf /` (any flag clustering) | Same — explicit fail-safe |
| `dd ... of=/dev/(disk\|sd\|nvme\|rdisk)*` | Raw disk overwrite |
| `mkfs.* /dev/(disk\|sd\|nvme\|rdisk)*` | Raw disk format |
| `diskutil eraseDisk` | Disk wipe |
| `DROP TABLE`, `DROP DATABASE`, `DROP SCHEMA` (case-insensitive) | SQL destruction at the command line (e.g. `psql -c "DROP TABLE x"`, `supabase db execute "..."`) |
| `gh repo delete` | GitHub repo deletion |

When a block fires, the AI sees the reason via Claude Code's hook system reminder; the user sees the same reason inline in the terminal. The command does not execute.

### Ask tier — these commands surface a permission dialog

| Pattern | Reason |
|---|---|
| `git reset --hard` (any form) | Discards uncommitted changes and any commits ahead of the target |
| `git push --force` (or `-f`) to non-main/master branches | Rewrites personal-branch history; routine during rebases but worth a confirm pause. "Non-main/master" is matched strictly — `master-prod`, `main-old`, `release/master`, `staging` all fire the dialog. Only the literal `main` and `master` branches are excluded (because branch protection on the remote covers them) |
| `chmod 777`, `chmod -R 777`, `chmod 0777` | Grants read/write/execute to everyone — the dialog reason explains this and suggests `chmod 750` or `chmod 755` instead. The 4-digit zero-padded form is also caught |

The dialog is rendered by Claude Code's standard permission UI. **The AI cannot see the dialog content and cannot auto-answer it** — only the human at the terminal can approve or deny. This is structurally how the harness stays useful even when an AI is driving the work.

---

## What's *not* caught (and why)

### Deliberately excluded patterns

- **`git push --force` to `main`/`master`** — server-side branch protection is the right layer for this. The local `.claude/CLAUDE.md` rule ("NEVER push to main directly") is the second layer. The hook would be a third layer for a problem two layers already address; not worth the maintenance.
- **`git commit --no-verify`** — Claude Code itself sometimes legitimately invokes `--no-verify`. Blocking would create false positives that train bypass behaviour.
- **`kill -9`** — by the time someone is typing it, they've usually already tried `kill` and want the nuke. A dialog here is pure friction.
- **`TRUNCATE TABLE`** — recoverable inside a transaction in most DBs and rare enough at the command line that v1 doesn't include it. Reconsider if a real near-miss occurs.

### Fundamentally hard cases (out of scope per the threat model)

These slip through because they require a parser, not pattern matching, and the threat model is honest mistakes — not deliberate evasion.

- Variable-expanded paths: `TARGET=/; rm -rf $TARGET`
- Base64'd / obfuscated commands: `echo "cm0gLXJmIC8=" | base64 -d | sh`
- Commands written to a file and then sourced: `echo "rm -rf /" > /tmp/x.sh && sh /tmp/x.sh`

### Compound commands — mostly caught via substring matching

The hook greps the **whole command string** as a single substring, so any compound form that places the destructive command + protected path as a literal substring is caught:

- `git status && rm -rf /` — caught (the `rm -rf /` substring fires the regex)
- `echo done; rm -rf /Users/foo` — caught
- `cat <<'EOF' | bash\nrm -rf /\nEOF` — caught (the heredoc body is part of the command string)
- `sh -c "rm -rf /"` — caught (the inner `rm -rf /` is in the command string)
- `` echo `rm -rf /Users/foo` `` and `echo $(rm -rf /Users/foo)` — caught

**Forms that route the path via stdin/pipes are not caught**, because the path arrives at runtime and never appears in the command string the hook inspects:

- `echo /Users/foo | xargs rm -rf` — **not caught** (path comes through xargs at runtime)

This is a known gap. Honest mistakes don't typically construct xargs pipelines for destructive ops, so the trade-off is acceptable per the threat model — but it means you should not rely on the harness as a defence against deliberate construction or sophisticated tooling chains.

---

## How to bypass

When you genuinely need to run a blocked command, **prefix the command inline** with `SAFETY_HARNESS_OFF=1`:

```bash
SAFETY_HARNESS_OFF=1 rm -rf ~/old-project
```

The hook detects the env var, prints `[safety-harness] disabled via SAFETY_HARNESS_OFF` to stderr (so the bypass is visible, not silent), and exits 0 without checking patterns.

### Important caveats

1. **Each Claude Code Bash tool call spawns a fresh shell.** Running `export SAFETY_HARNESS_OFF=1` in one tool call does *not* persist to the next. Use the inline-prefix form per command, or set it in the parent shell *before* launching `claude` (rare and not recommended — see point 3).

2. **The bypass message is visible to AI agents too.** An AI that hits a block can read the bypass instructions and apply them on retry. The harness's value is that the block creates a *moment* where the human can intervene — not that an AI can't get past it. This is intentional per the threat model.

3. **Don't put `export SAFETY_HARNESS_OFF=1` in `.zshrc` or `.envrc`.** If you do, the harness is off forever and you'll forget. The whole point of inline-prefix is that the bypass is per-command and intentional.

---

## How it composes with the allowlist

The allowlist (`permissions.allow` in `.claude/settings.json`) and the safety harness are two different mechanisms with different jobs:

- **Allowlist:** decides whether Claude Code prompts you before running a command. Controls UX friction on routine ops.
- **Safety harness:** decides whether a dangerous command runs at all. Fires regardless of allowlist state.

Order of evaluation: allowlist → PreToolUse hook → command executes. Allowlisting `Bash(git push *)` does **not** bypass force-push patterns in the harness. That's deliberate.

This means: don't add `Bash(rm -rf:*)` to the allowlist as a "convenience" — the allowlist would silence the prompt, but the harness would still block. Keep dangerous-command patterns un-allowlisted so both layers fire when needed.

### Two PreToolUse hooks coexist

The project registers two `PreToolUse` hooks in `.claude/settings.json`. They are scoped to different tools and never both fire on the same call:

| Hook | Matcher | Purpose |
|---|---|---|
| `safety-harness.sh` | `Bash` (with an `if`-filter alternation) | Block / ask on destructive Bash commands |
| `approve-scratch-write.sh` | `Write` | Auto-approve `Write` into `<project>/SCRATCH/` (works around an upstream allow-list matcher quirk) |

Keeping the matchers tool-disjoint is the discipline that makes the composition safe — neither hook needs to know the other exists. If a future hook covers a third tool (`Edit`, `MultiEdit`), follow the same pattern: one hook per tool, sharing the parse helper at `.claude/hooks/lib/parse-tool-input.sh`. See [`REFERENCE/scratch-write-hook.md`](./scratch-write-hook.md) for the SCRATCH/ Write hook's contract.

---

## How to extend

Adding a pattern is a deliberate per-PR decision. Steps:

1. **Confirm the pattern matches the rubric.** Block tier = irreversible destruction of high-value paths. Ask tier = destructive-or-risky with a legitimate use case where the user disambiguates intent. If it's neither, it probably doesn't belong in the harness — most things are recoverable via `git reflog`, Time Machine, or `git status` before commit.

2. **Add the pattern to `.claude/hooks/safety-harness.sh`.** Follow the existing block layout: a `grep -qE` against the command string, then `emit deny` or `emit ask` with a clear reason. Keep the regex tight to avoid false positives — false positives train bypass behaviour, defeating the harness.

3. **Update the `if` filter in `.claude/settings.json`** so the hook script actually spawns for the new command family. The filter uses `Bash(cmd1 * | cmd2 * | ...)` syntax with `|` alternation.

4. **Add fixtures under `.claude/hooks/tests/safety-harness/fixtures/`:**
   - `your-pattern-name.in.json` — a sample command that should match
   - `your-pattern-name.expected.json` — the JSON the hook should emit
   - Also add a "near miss" fixture (similar-looking command that should NOT match) under `*.in.json` paired with an empty `*.expected.json` (default-allow behaviour).

5. **Run the test suite:** `.claude/hooks/tests/safety-harness/run-tests.sh`. It loops fixtures through the hook and diffs output against expected.

6. **Update this file** with the new pattern in the appropriate table, plus reasoning if the discriminator is unobvious.

---

## Troubleshooting

### A legitimate command got blocked

Use the inline bypass: `SAFETY_HARNESS_OFF=1 <your command>`. If the same legitimate pattern is hitting block repeatedly, that's a regex-too-broad bug — file a follow-up to tighten the pattern (or move it to ask tier so the user can confirm rather than bypass).

### The hook isn't firing on a command I expected to catch

1. Check the `if` filter in `.claude/settings.json`. The hook script only spawns when the command matches one of the filter alternatives. If your pattern's command family isn't in the filter, the script never runs.
2. Run the hook offline against the literal command:
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"<your command>"}}' | .claude/hooks/safety-harness.sh
   ```
   If the hook returns the expected JSON offline but doesn't fire live, the issue is in the registration; if it returns nothing offline, the issue is in the regex.

### `systemMessage` doesn't show up

The hook does not use `systemMessage` — interactive Claude Code does not render it. `chmod 777`'s educational message rides on the ask-dialog reason instead. (See [`SPECIFICATIONS/ARCHIVE/pretooluse-safety-harness.md`](../SPECIFICATIONS/ARCHIVE/pretooluse-safety-harness.md) § Implementation findings for the discovery context.)

### Patterns suddenly stopped firing

The hook depends on `python3` for JSON parsing. If `python3` is missing from `PATH` or crashes, the script silently exits 0 and the harness does nothing — fail-open. Verify with `which python3`. On macOS the system Python is at `/usr/bin/python3`; on Linux it varies. If the harness ever appears to stop working, this is the first thing to check.

### The hook is making every Bash call slow

The `if` filter exists precisely to avoid this — it should prevent the hook script from spawning except for command families that might match. If you're seeing per-call latency on commands that aren't in the filter (e.g. `git status`, `ls`), check that the filter is actually present in `.claude/settings.json` under `hooks.PreToolUse[0].if`.

### How do I disable the hook entirely (not just for one command)?

Either:
- Set `SAFETY_HARNESS_OFF=1` in the parent shell before launching `claude` (disables for the whole session — visible in `env` output)
- Comment out or delete the `hooks.PreToolUse` block in `.claude/settings.json` (disables permanently)

---

## Credits

The pattern set is adapted from [`davekilleen/Dex`'s `dex-safety-guard.sh`](https://github.com/davekilleen/Dex/blob/main/.claude/hooks/dex-safety-guard.sh). We diverge from Dex in three ways: we use the current `hookSpecificOutput.permissionDecision` JSON contract (not the deprecated `decision`/`reason` shape Dex uses); we add the ask tier (Dex is binary block/allow); and we narrow `dd`/`mkfs` to output-device patterns rather than matching the bare commands.

Implementation history and the full review trail are at [`SPECIFICATIONS/ARCHIVE/pretooluse-safety-harness.md`](../SPECIFICATIONS/ARCHIVE/pretooluse-safety-harness.md).
