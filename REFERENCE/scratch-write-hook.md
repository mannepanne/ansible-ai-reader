# SCRATCH Write hook — `PreToolUse`

Auto-approves `Write` tool calls whose target path is under `<project>/SCRATCH/`. The hook compensates for a Claude Code matcher quirk where `Write(/SCRATCH/*)` allow-list entries do not silence the permission prompt for `Write` even though the documented `/path` semantics say they should.

The decision rationale and alternatives are in [`REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md`](./decisions/2026-04-26-scratch-write-pretooluse-hook.md). This file is the operations reference: what the hook does, when it fires, when it falls through, how to extend it, how to remove it.

---

## What the hook does

For every `Write` tool call:

1. Parses `tool_name` and `tool_input.file_path` from the JSON delivered on stdin (via the shared parser at `.claude/hooks/lib/parse-tool-input.sh`).
2. If `tool_name` is not exactly `Write`, exits 0 with no output (passthrough).
3. If `CLAUDE_PROJECT_DIR` is unset, exits 0 with no output (fail-closed — never approve against a relative or empty prefix).
4. If `file_path` contains the literal substring `..`, exits 0 with no output (rejects traversal forms).
5. If `file_path` matches `$CLAUDE_PROJECT_DIR/SCRATCH/<at least one segment>`, emits a JSON `permissionDecision: "allow"` with a brief reason string and exits 0.
6. Otherwise exits 0 with no output (Write outside SCRATCH/ surfaces the normal Claude Code prompt).

The hook only ever emits `allow`. It cannot emit `deny` or `ask`. Its worst-case behaviour is a no-op — the user sees the normal prompt instead of a silent approve. Because of that, there is no `SCRATCH_WRITE_HOOK_OFF` style escape hatch; nothing destructive needs an escape route.

---

## Where it sits in the call path

| Layer | What it decides | Order |
|---|---|---|
| Allow-list (`permissions.allow`) | Whether the prompt fires for safe operations | First |
| `PreToolUse` hooks (`safety-harness.sh`, `approve-scratch-write.sh`) | Whether the tool call runs, prompts, or is auto-approved | Second |
| Tool execution | The actual operation | Third |

The two `PreToolUse` hooks are scoped to different tools (Bash vs Write) and never both fire on the same call. See [`safety-harness.md`](./safety-harness.md) → "How it composes with the allow-list" for the equivalent diagram on the Bash side.

---

## What's caught

The hook approves the `Write` call when **all** of these are true:

- `tool_name == "Write"`
- `CLAUDE_PROJECT_DIR` is set
- `file_path` does not contain the literal substring `..`
- `file_path` matches the case pattern `"$CLAUDE_PROJECT_DIR"/SCRATCH/*` (note the trailing `/*` — at least one path segment after `SCRATCH/`)

A typical approved call looks like `Write` to `<project>/SCRATCH/review-pr-33-team.md`.

---

## What's *not* caught (and why)

### By scope, on purpose

- **`Edit` and `MultiEdit` to SCRATCH/** — the hook is `Write`-only because the upstream defect is `Write`-only. `Edit` and `MultiEdit` honour the allow-list matcher; if a future review skill needs to edit SCRATCH/ files, add allow-list entries instead of expanding the hook.
- **The `SCRATCH/` directory entry itself, or sibling directories like `SCRATCHPAD/`** — the case pattern requires at least one segment after `SCRATCH/`. A Write to `<project>/SCRATCH/` with no filename never makes it through the OS layer anyway; a Write to `<project>/SCRATCHPAD/foo` is a genuinely different directory and should not inherit the SCRATCH approval.
- **Writes outside `<project>/SCRATCH/`** — the hook only ever approves SCRATCH/ paths. Everything else falls through to the normal prompt.

### By the threat model

The hook does textual prefix-matching against `$CLAUDE_PROJECT_DIR/SCRATCH/`, not `realpath` resolution. Consequences:

- **A symlink inside `SCRATCH/` pointing outside the project will be approved.** A malicious committer who plants `<project>/SCRATCH/escape -> /etc` could trigger an approved Write to `/etc/passwd` (subject to OS permissions).
- **`SCRATCH` itself being a symlink to elsewhere is approved.** If `SCRATCH/` is a symlink to `/tmp/escape/`, every Write under `/tmp/escape/<segment>` is approved.

Both are out of scope per the [threat-model ADR](./decisions/2026-04-25-pr-review-threat-model.md) — exploitation requires a malicious committer, the same class as "backdoors in test code." Derivative projects whose contributor model differs (open-source PRs from strangers, multi-team enterprise, regulated environments) should follow the ADR's [tightening checklist](./decisions/2026-04-25-pr-review-threat-model.md#tightening-checklist-for-derivative-projects-whose-use-case-differs) — items #7 and #8 cover the symlink and `git diff --ext-diff` cases.

### As a cosmetic UX trade-off

The `..` rejection uses `case "$FILE_PATH" in *..*)` — it matches the literal substring `..` *anywhere*, not as a path *segment*. This means legitimate filenames like `notes..md`, `v1.2..rc1.txt`, or `temp..backup` fall through the hook (no approval) and surface the normal prompt. The user sees "approve write to SCRATCH/notes..md?" and clicks through. Tightening this to segment-only patterns (`*/../*`, `*/..`, `../*`, `..`) is a future option if the filename pattern actually surfaces in real work; until then, the over-broad reject is simpler and the false-negative is harmless.

---

## Fail-closed semantics

The hook silently exits 0 with no output (= falls through to the normal prompt) under any of these conditions:

- `python3` is missing from `PATH`, errors, or returns malformed JSON.
- The input JSON is malformed or missing `tool_name` / `tool_input` / `tool_input.file_path`.
- `CLAUDE_PROJECT_DIR` is unset.
- The path contains a `..` substring.
- The path is not under `$CLAUDE_PROJECT_DIR/SCRATCH/`.

The user gets the normal Claude Code prompt in every failure mode. The worst case is the friction the hook was added to remove — never a silent approve of something unintended.

---

## How to extend

Adding to the hook is rare — it has one job. Most "I want fewer prompts on X" answers go through the allow-list, not the hook. Reach for a hook only when an allow-list entry empirically fails to silence the prompt, the way `Write(/SCRATCH/*)` does today.

### Adding a fixture

When you add or change behaviour, mirror the pattern at `.claude/hooks/tests/approve-scratch-write/`:

1. **Fixture pair under `fixtures/`**:
   - `<name>.in.json` — the JSON delivered on stdin (a synthesised `tool_name` + `tool_input.file_path` shape).
   - `<name>.expected.json` — the JSON the hook must emit, OR an empty file for passthrough cases.
2. **Fixture-naming convention** — the test runner enforces:
   - `approve-*` fixtures must have non-empty `.expected.json` (the hook must approve).
   - `passthrough-*` fixtures must have empty `.expected.json` (the hook must fall through).
3. **Run the suite**: `bash .claude/hooks/tests/approve-scratch-write/run-tests.sh`. Tests pin `CLAUDE_PROJECT_DIR=/tmp/test-project` so fixture paths can be hard-coded.

### Adding a new tool to the matcher

If the upstream `Write`-matcher defect is fixed *and* you want the hook to also cover `Edit`/`MultiEdit` for some reason, the registration needs adjusting:

- `.claude/settings.json` `hooks.PreToolUse[1].matcher` — change `"Write"` to a list, or duplicate the entry. Matcher syntax is documented at https://docs.claude.com/en/docs/claude-code/hooks.md.
- The hook itself currently has `if [ "${TOOL_NAME:-}" != "Write" ]; then exit 0; fi`. Update to allow other tool names if the matcher widens.
- Update the test suite — the `passthrough-non-write-tool` fixture currently covers an Edit call falling through; that fixture would need to flip to an `approve-*` if Edit becomes in scope.

The simpler alternative is a **second hook** — the safety-harness/`approve-scratch-write` split worked because the matchers don't overlap. A third hook for `Edit`-to-SCRATCH would follow the same pattern, sharing the parse helper at `.claude/hooks/lib/parse-tool-input.sh`.

---

## How to remove the hook (if upstream `Write` allow-list is fixed)

If Claude Code ships a fix that makes `Write(/SCRATCH/*)` actually silence the prompt:

1. **Verify the fix in a fresh Claude Code session.** Run a review skill that writes to `SCRATCH/`. Confirm no prompt fires.
2. **Re-introduce the allow-list entries** in `.claude/settings.json` (`Write(/SCRATCH/*)` is the documented project-relative form).
3. **Remove the hook registration** from `.claude/settings.json` `hooks.PreToolUse` (the entry whose `matcher` is `Write`).
4. **Delete the hook script** at `.claude/hooks/approve-scratch-write.sh` and the test suite at `.claude/hooks/tests/approve-scratch-write/`.
5. **Supersede the ADR.** Mark `REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md` as `Status: Superseded` with a pointer to the new ADR documenting the fix.
6. **Move the investigation doc** at `SPECIFICATIONS/ARCHIVE/INVESTIGATION-claude-code-write-path-normalisation.md` to a closed state — it has served its purpose.

The shared parse helper at `.claude/hooks/lib/parse-tool-input.sh` stays — `safety-harness.sh` still uses it.

---

## Troubleshooting

### The prompt still fires when writing to SCRATCH/

The most likely cause is a stale Claude Code session. The hook is registered at session start; changes to `.claude/settings.json` don't propagate to a running session. Restart Claude Code and try again.

If the prompt still fires in a fresh session:

1. Confirm the hook is registered:
   ```bash
   grep -A2 'matcher.*Write' .claude/settings.json
   ```
   Expect an entry pointing at `$CLAUDE_PROJECT_DIR/.claude/hooks/approve-scratch-write.sh`.

2. Confirm the script is executable:
   ```bash
   test -x .claude/hooks/approve-scratch-write.sh && echo "ok"
   ```

3. Run the hook offline against the literal path:
   ```bash
   echo '{"tool_name":"Write","tool_input":{"file_path":"'$PWD'/SCRATCH/test.md"}}' | \
     CLAUDE_PROJECT_DIR=$PWD .claude/hooks/approve-scratch-write.sh
   ```
   If the hook returns the expected JSON offline but doesn't fire live, the issue is in the registration; if it returns nothing offline, the issue is in the matching logic (likely a path mismatch — confirm the file_path the prompt receives is absolute, not cwd-relative).

### A legitimate filename containing `..` got prompted

That's the cosmetic UX trade-off in the `What's not caught` section above. The hook rejects any path containing the literal substring `..`. Approve the prompt manually, or rename the file. If this pattern surfaces repeatedly in real work, file a follow-up to tighten the pattern to segment-only.

### The hook approved a write outside SCRATCH/

That should not happen — the hook only emits `allow` when the path matches `$CLAUDE_PROJECT_DIR/SCRATCH/*`. If it does, capture the input JSON (the prompt UI shows the path) and run the hook offline against that exact input to reproduce. File it as a bug; the test suite should be extended with the failing case.

### `python3` is missing or broken

The hook depends on `python3` for JSON parsing. If `python3` is missing from `PATH`, errors, or returns malformed JSON, the script silently exits 0 — fail-passthrough. The user sees the normal prompt. Verify with `which python3`. On macOS the system Python is at `/usr/bin/python3`.

---

## Inheriting this fix in a derivative project

The hook + registration + tests + reference doc + ADR all need to land together. The TEMPLATE-UPDATES migration packet at [`REFERENCE/TEMPLATE-UPDATES/2026-04-threat-model-and-safety-harness/`](./TEMPLATE-UPDATES/2026-04-threat-model-and-safety-harness/) carries the SCRATCH-write hook (script, parse helper, registration, test suite, this ops doc, the ADR, and the investigation log) as a coherent unit alongside the safety-harness pieces. Derivative projects that copy `.claude/settings.json` alone will see the SCRATCH/ Write prompt return — apply the migration packet end-to-end, or copy the hook script, the registration, the parse helper at `.claude/hooks/lib/parse-tool-input.sh`, and the supporting docs together with the settings.
