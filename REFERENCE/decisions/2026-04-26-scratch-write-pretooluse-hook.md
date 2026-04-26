# ADR: PreToolUse hook as the authoritative path for silencing SCRATCH/ Write prompts

**Date:** 2026-04-26
**Status:** Active
**Supersedes:** N/A

---

## Decision

The `Write` tool's permission prompt for paths under `<project>/SCRATCH/` is silenced by a project-local `PreToolUse` hook (`.claude/hooks/approve-scratch-write.sh`) that emits an explicit `permissionDecision: "allow"`. The corresponding `Write(...)` allow-list entries are removed from `.claude/settings.json` because none of the four documented glob shapes (`Write(/SCRATCH/*)`, `Write(/SCRATCH/**)`, `Write(SCRATCH/*)`, `Write(SCRATCH/**)`) silence the prompt for `Write` in fresh Claude Code sessions.

The hook is the canonical, supported path for SCRATCH/ Write approvals until and unless the upstream allow-list matcher is fixed and the fix is verified. `Read(/SCRATCH/...)` allow-list entries remain — `Read` does honour the matcher, only `Write` does not.

## Context

The review-skill workflow writes intermediate comment-body files into a top-level `SCRATCH/` directory before posting them via `gh pr comment --body-file`. With `Write(/SCRATCH/*)` in `permissions.allow`, the `Write` call still surfaced a permission prompt in fresh sessions across two repos and at least five distinct sightings (documented in `SPECIFICATIONS/ARCHIVE/INVESTIGATION-claude-code-write-path-normalisation.md`). The investigation walked through three hypotheses:

1. Stale in-memory allow-list — eliminated; the prompt fired on fresh-session runs.
2. Wrong glob shape — eliminated; PR 32 reproduced the prompt with all four shapes simultaneously committed.
3. The `Write` tool gates *beyond* the allow-list matcher — confirmed by elimination.

`PreToolUse` hooks run *before* the tool's gating layer and emit a `hookSpecificOutput.permissionDecision` that the matcher cannot override. They are the documented escape hatch for exactly this class of problem.

## Alternatives considered

- **Keep relying on the allow-list and ship with the prompt.** Why not: every review run pauses on the first `Write` to SCRATCH/. The friction is constant and unhelpful — the contributor approves the same write hundreds of times.

- **Move review-skill scratch files back to `/tmp/`.** Why not: `/tmp/` paths surface the `../../../../../../tmp/...` traversal display in the prompt UI (the original PR-19 sighting), and `/tmp/` collides across concurrent sessions. The migration to project-local `SCRATCH/` predates this ADR and was the right move on its own merits.

- **Use a Claude Code IDE extension or upstream config to bypass the prompt.** Why not: out of project scope, requires every contributor to install something external, and depends on Claude Code shipping a fix — open-ended timeline.

- **Keep the dead `Write(/SCRATCH/*)` allow-list entries and add comments explaining they don't work.** Why not: a future maintainer or derivative-project copyist sees four "documented" allow shapes and reasonably assumes one of them works. The presence of dead entries actively misleads. Removing them and pointing at the hook is cleaner.

- **Chosen: PreToolUse hook + remove dead `Write` allow-list entries + keep `Read(/SCRATCH/...)` entries.** The hook is the authoritative path for `Write`. The `Read` entries stay because `Read` honours the allow-list matcher; only `Write` is broken.

## Reasoning

**The hook is the only mechanism that empirically works.** PR 32's fresh-session run with all four glob shapes simultaneously present did not silence the prompt. The hook's first fresh-session run did. That is the empirical fact this ADR is built on.

**The hook is fail-safe by design.** It only ever emits `permissionDecision: "allow"`. It cannot emit `deny` or `ask`, so it cannot weaken the existing safety-harness Bash hook or block any operation. If python3 errors, JSON is malformed, `CLAUDE_PROJECT_DIR` is unset, or the file path contains a `..` segment, the hook exits 0 with no output and the user gets the normal Claude Code prompt — exactly the right degradation.

**Scope is narrow on purpose.** The hook approves `Write` only, paths textually under `$CLAUDE_PROJECT_DIR/SCRATCH/` only, with explicit `..` traversal rejection. `Edit`, `MultiEdit`, and any other tool fall through silently. SCRATCH itself or sibling directories like `SCRATCHPAD` fall through (the case pattern requires at least one segment after `SCRATCH/`).

**Symlink and exotic-filename cases are out of scope per the threat model.** A symlink inside `SCRATCH/` pointing outside the project would be approved (the hook does textual prefix-matching, not `realpath` resolution); legitimate filenames containing the literal substring `..` (e.g. `notes..md`) are silently rejected by the over-broad `..` filter and surface the normal prompt. Both are documented in [`REFERENCE/scratch-write-hook.md`](../scratch-write-hook.md). The first is consistent with the threat-model ADR's [tightening checklist](./2026-04-25-pr-review-threat-model.md#tightening-checklist-for-derivative-projects-whose-use-case-differs) — exploitation requires a malicious committer planting symlinks. The second is a cosmetic UX papercut, not a security issue.

**Keep the dead `Write` allow-list entries out of `settings.json`.** Future readers of the file see only entries that actually silence prompts; the hook explains the SCRATCH/ behaviour via a `_comment_scratch_writes` field that points at this ADR. Derivative projects that copy the file get a coherent picture instead of an inconsistency.

**Keep the redundant runtime engineering for now.** If Claude Code ever fixes the `Write` allow-list matcher, the hook becomes the *redundant* layer rather than the *authoritative* one — at which point the right move is to add `Write(/SCRATCH/*)` back, verify it works in a fresh session, and remove the hook. Today the hook is load-bearing; tomorrow it might be a backup. The ADR captures the current state so the future decision is informed.

## Trade-offs accepted

**Hook process spawn on every Write call.** The matcher `"Write"` registers the hook for every `Write` invocation, not just SCRATCH/ ones. Each invocation cold-starts python3. On a slow filesystem or under heavy concurrent Writes this is measurable. The cost is acceptable because the hook needs to *see* every Write to decide whether to silence the prompt; an `if`-filter at registration time would not cleanly express "path starts with `$CLAUDE_PROJECT_DIR/SCRATCH/`" because the `if` filter operates on the tool-call shape, not the path. If a third Write-gating hook ever appears, reconsider this trade-off.

**Hook compensates for an unfixed upstream defect.** The root cause in Claude Code's `Write` allow-list matcher is unresolved. This ADR explicitly documents that we are working around the symptom rather than fixing the cause. The investigation document at [`SPECIFICATIONS/ARCHIVE/INVESTIGATION-claude-code-write-path-normalisation.md`](../../SPECIFICATIONS/ARCHIVE/INVESTIGATION-claude-code-write-path-normalisation.md) preserves the diagnosis log so a future upstream-fix verification can replay the test cases.

**Derivative projects need to apply the hook to inherit the fix.** A derivative project that copies only `.claude/settings.json` (without the hook script and its registration) gets dead allow-list entries — actually, gets *no* allow-list entries for `Write(/SCRATCH/...)` after this ADR's cleanup, since they were removed — and the prompt fires. The TEMPLATE-UPDATES migration packet system carries the hook + registration + reference doc as a coherent unit; ad-hoc copying does not. Documented at the top of [`REFERENCE/scratch-write-hook.md`](../scratch-write-hook.md).

**Tests are fixture-based, not session-based.** The 7-test suite at `.claude/hooks/tests/approve-scratch-write/` validates the hook's JSON output for synthetic inputs. It does not — and cannot — validate "the hook is registered correctly in `.claude/settings.json` and Claude Code actually fires it before the matcher gates `Write`." That end-to-end behaviour is verified by a fresh-session smoke test (described in the reference doc) and re-verified whenever the hook or its registration changes.

## Implications

**Enables:**
- Silent review skill runs end-to-end. The dispatcher posts `gh pr comment --body-file SCRATCH/...` without a `Write` prompt; the test suite no longer needs a manual approval click during automated review work.
- Single canonical answer to "why doesn't the SCRATCH allow-list entry work?" — see this ADR.
- A clear migration path if Claude Code fixes the matcher: re-introduce the allow-list entry, verify in a fresh session, remove the hook, supersede this ADR.

**Prevents/complicates:**
- Hook-shaped logic must be maintained inside `.claude/hooks/`, with an associated test suite and reference doc. The maintenance burden is real but small (one script, ~90 lines).
- Derivative projects that don't apply the hook see the prompt return. The TEMPLATE-UPDATES packet at `REFERENCE/TEMPLATE-UPDATES/2026-04-threat-model-and-safety-harness/` carries the hook script, the parse helper, the test suite, the registration, this ADR, the ops doc, and the investigation log as one unit — derivative projects applying the packet inherit the fix in full.
- Concurrent extension to `Edit`/`MultiEdit` would require either expanding the hook's matcher or registering a sibling hook; not a problem today, but documented so a future change knows to look here.

---

## References

- Related ADRs:
  - [2026-04-25 — PR review system assumes a solo trusted contributor](./2026-04-25-pr-review-threat-model.md) — the threat model that calibrates the hook's symlink-escape and `..`-filename behaviour as out-of-scope.
  - [2026-04-26 — Allow-list pinning principle](./2026-04-26-allowlist-pinning-principle.md) — sibling ADR; sets granularity for entries that *do* work via the matcher.
- Anchor points in code/config:
  - `.claude/hooks/approve-scratch-write.sh` — the hook script.
  - `.claude/hooks/lib/parse-tool-input.sh` — shared parse helper used by both PreToolUse hooks.
  - `.claude/hooks/tests/approve-scratch-write/` — fixture-based test suite.
  - `.claude/settings.json` — `hooks.PreToolUse[1]` registers the hook; `permissions._comment_scratch_writes` points at this ADR.
  - `REFERENCE/scratch-write-hook.md` — how-it-works documentation.
- Investigation log:
  - `SPECIFICATIONS/ARCHIVE/INVESTIGATION-claude-code-write-path-normalisation.md` — the five-sighting diagnosis trail that produced hypothesis #3.
- Discussion that produced this ADR: PR 33 review thread on `mannepanne/useful-assets-template`.
