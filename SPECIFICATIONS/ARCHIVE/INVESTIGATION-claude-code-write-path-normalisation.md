# Investigation: Claude Code Write path-normalisation for allowlist matching

**Type:** Closed investigation (symptom silenced; root cause unresolved upstream)
**Status:** **Closed 2026-04-26.** Symptom silenced via the `PreToolUse` hook at `.claude/hooks/approve-scratch-write.sh` (PR 33). Hypothesis #3 confirmed: the `Write` tool's allow-list matcher does not silence prompts for any of `Write(/SCRATCH/*)`, `Write(/SCRATCH/**)`, `Write(SCRATCH/*)`, `Write(SCRATCH/**)` in fresh sessions. Step 4 fresh-session smoke test confirmed the hook silences the `Write` prompt as intended.

**Decision rationale:** [`REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md`](../../REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md)
**Operations reference:** [`REFERENCE/scratch-write-hook.md`](../../REFERENCE/scratch-write-hook.md)

**Closing note.** Root cause inside Claude Code's `Write` allow-list matcher is unknown and unaddressed upstream. The hook is the supported path until the upstream defect is fixed and verified — at which point follow the rollback procedure in the operations reference. The five-sighting diagnosis trail below is preserved so a future verification of an upstream fix can replay the test cases.

---

## Symptom

During PR 19's team review the dispatcher tried to write `/tmp/review-pr-19-triage.md` and was prompted, despite `Write(/tmp/review-pr-*)` being in the allowlist. The displayed path in the permission prompt was `../../../../../../tmp/review-pr-19-triage.md`.

On a follow-up dispatcher run (PR 20's light review, post-merge of PR 19, fresh session), the same Write call ran silently with the same allowlist entry — no prompt.

**Third sighting (2026-04-26, derivative project):** during a `/review-pr 67` team review the dispatcher tried to write `/tmp/review-pr-67-triage.md` and was prompted with the same `../../../../../../tmp/...` traversal form. Same six-level depth as PR 19.

**Fourth sighting (2026-04-26, this repo, post-PR-31-merge session):** with `Write(/SCRATCH/*)` and `Read(/SCRATCH/*)` committed in `.claude/settings.json` and a Write to `<project>/SCRATCH/review-pr-31-standard.md`, the prompt **still fired**. The exact displayed path was not captured (next-session task — see "Next step").

**Fifth sighting (2026-04-26, this repo, fresh session, `/review-pr 32`):** prompt fired again on `Write` to `SCRATCH/review-pr-32-light.md`. Key new evidence:
- **Displayed path was bare cwd-relative form**: `SCRATCH/review-pr-32-light.md` — *not* the `../../../../../../tmp/...` traversal form, *not* `/SCRATCH/...`. Different display shape from the `/tmp/` sightings.
- **Only the Write tool prompted.** Triage-reviewer, light-reviewer, and technical-writer subagents all ran silently — including their `gh pr view`, `gh pr diff`, and Bash calls. The post-approval `Bash(gh pr comment ... --body-file SCRATCH/...)` also ran silently.
- **Fresh session**, so hypothesis #1 (stale in-memory allowlist) is **eliminated**.
- **Reproduces in a separate derivative project** with the same template state — eliminates project-specific weirdness.

## Primary-source semantics (confirmed)

Verified against https://code.claude.com/docs/en/permissions.md (§ "Read and Edit"):

- `/path` in a permission glob = **project-root-relative** (e.g. `Edit(/docs/**)` matches `<project>/docs/`, **not** filesystem `/docs/`).
- `//path` = filesystem-absolute (explicit, documented).
- `~/path` = home directory.
- `./path` or bare `path` = cwd-relative.
- `*` matches a single directory level; `**` matches recursively.
- `.claude/` (and `.git/`, `.vscode/`, `.idea/`, `.husky/`) are **protected directories** that prompt even in `bypassPermissions` mode. This applies regardless of allowlist entries.
- The matcher checks both the requested path and any symlink-resolved target — so *some* path resolution happens internally.
- Docs are **silent** on:
  - Whether the matcher normalises absolute tool-input paths to project-relative form before matching (symlink handling implies it does, but no explicit statement).
  - Env-var interpolation (`$CLAUDE_PROJECT_DIR` etc.) in permission patterns.

### Retroactive explanation of the `/tmp/` traversal display

The `../../../../../../tmp/...` form shown in PR 19's prompt is consistent with the matcher resolving the absolute tool-input path to project-relative form: from project root `/Users/magnus/Documents/Coding/AllUsefulAssets/useful-assets-template/`, six `../` levels reach filesystem root, so `../../../../../../tmp/...` is the project-relative spelling of `/tmp/...`.

That also retroactively explains why `Write(/tmp/review-pr-*)` was the wrong entry shape all along: by docs, `/tmp/` is project-root-relative, so the matcher was looking for `<project>/tmp/...`, not filesystem `/tmp/...`. The correct shape would have been `Write(//tmp/review-pr-*)` (double-leading-slash for filesystem-absolute). The PR 20 silent run is then plausibly explained as a one-off "always-allow" click rather than genuine intermittency.

This sub-claim is consistent but not directly verified — capturing the exact displayed path next time the prompt fires would either confirm or refute it.

## Mitigation taken (not a fix)

The review skills were migrated to write into `<project>/SCRATCH/` rather than `/tmp/`:
- Avoids the absolute-vs-project-relative mismatch that broke `Write(/tmp/...)` entries.
- Avoids the `.claude/` protected-directory gate (which would prompt regardless).
- Contents gitignored so artefacts don't leak.

Allowlist entries became `Write(/SCRATCH/*)` and `Read(/SCRATCH/*)`. **Per docs these should silence the prompt for writes to `<project>/SCRATCH/file.md`.** Empirically (PR 31 post-merge session, fourth sighting) they did not. Root cause unknown.

## Disproven hypothesis: "leading-slash form fixes it"

A previous version of this doc claimed:

> the leading-slash form `Write(/SCRATCH/*)` and `Read(/SCRATCH/*)` matches reliably. This is a permission-glob shape issue, distinct from the `/tmp/` traversal-form intermittency above.

**This claim is false.** It was based on a single intra-session observation; the next attempted Write in the same session prompted again. The leading-slash semantics are correct per docs, but something else is preventing the match in practice.

## Live hypotheses (ordered by likelihood after fifth sighting)

1. ~~**Stale in-memory allowlist.**~~ **Eliminated** by fifth sighting (fresh session still prompts).

2. **Glob-shape pickiness.** Docs say `*` matches a single directory level and `/path` is project-root-relative. `Write(/SCRATCH/*)` should match `SCRATCH/file.md`, but the matcher displays the input path as bare cwd-relative `SCRATCH/...` (no leading slash) — that display divergence is suggestive that the leading-slash and bare forms aren't being treated as equivalent at match time. **Now the leading hypothesis.**

3. **Undocumented gate on the Write tool.** Write tool may have approval logic beyond the documented allowlist — e.g. unconditional gating on new-file creation regardless of glob match. The fifth sighting evidence that *only* the Write tool prompted (Bash, Read, subagent invocations all silent) keeps this live. Surfaces as "no glob shape silences it" in the experiment below.

## Active experiment (running now — refresh from here after session restart)

**Working theory:** the matcher canonicalises Write paths to bare cwd-relative form (`SCRATCH/file.md`) for matching, but the documented `/path` semantics (project-root-relative) mean `Write(/SCRATCH/*)` is being parsed as a literal-leading-slash glob that doesn't match the canonicalised form. Belt-and-braces: add every plausible glob shape simultaneously so at least one matches.

**Step 1 — done in this session (commit on branch `fix/investigation-doc-update`):**

Added all four glob-shape variants for both `Write` and `Read` to `.claude/settings.json`:

```jsonc
"Write(/SCRATCH/*)",
"Write(/SCRATCH/**)",
"Write(SCRATCH/*)",
"Write(SCRATCH/**)",
"Read(/SCRATCH/*)",
"Read(/SCRATCH/**)",
"Read(SCRATCH/*)",
"Read(SCRATCH/**)"
```

Glob lists are additive — any single matching entry silences the prompt. Commit this on the feature branch before restarting the session so the change is loaded at session start.

**Step 2 — done (fresh session, post-PR-32-merge):**

Fresh-session run of `/review-pr 32` with all four `Write` shapes present. The `Write` to `SCRATCH/review-pr-32-standard.md` **still prompted**. Sixth sighting — hypothesis #2 (glob-shape pickiness) **eliminated**, hypothesis #3 (Write tool gates beyond the documented allowlist matcher) **confirmed**. None of `Write(/SCRATCH/*)`, `Write(/SCRATCH/**)`, `Write(SCRATCH/*)`, `Write(SCRATCH/**)` silence the prompt.

**Step 3 — done (this PR):**

Implemented the fallback `PreToolUse` hook: `.claude/hooks/approve-scratch-write.sh`. Matches the `Write` tool, checks the absolute `file_path` against `$CLAUDE_PROJECT_DIR/SCRATCH/`, rejects `..` traversal, emits `permissionDecision: "allow"` when inside SCRATCH/, and falls through silently otherwise. Test suite at `.claude/hooks/tests/approve-scratch-write/` (7 fixtures, all green).

**Step 4 — requires fresh session (verification):**

Restart Claude Code, run any review that writes into `SCRATCH/`. Two outcomes:

- **Silent (no prompt fires):** hook works as intended. Hypothesis #3 is fully confirmed (Write gates beyond the allowlist but respects PreToolUse hooks). Time to file the upstream bug — we have docs saying X, fresh-session observation showing Y across two projects, all four glob-shape variants exhausted, and a hook-level workaround proven necessary.
- **Still prompts even with the hook:** the Write tool has gating that ignores PreToolUse hooks too. That would be a Claude Code bug worth filing immediately — at that point there is no workaround short of always pressing approve.

**Why not jump straight to the hook?** (kept for reference — superseded by Step 2 result.) Because the hook is a workaround, not a diagnosis. The Step 2 fresh-session test cost nothing and told us definitively that the documented `/path` semantics do not work in practice for `Write`. Every other `/path` allowlist entry in this template should now be considered suspect for the `Write` tool specifically — `Bash` and `Read` allowlist entries appear to work fine (no prompts during the same session for `gh pr ...`, `git ...`, or subagent reads).

## Why this matters

If the matcher behaviour genuinely diverges from documented semantics, every `/path/...` entry in the allowlist is unreliable. The current symptom is mild (an extra approval click), but the same ambiguity affects any future allowlist tightening — including the threat-model-driven defaults shipped with this template.

## Outcome

Step 4 fresh-session smoke test passed. The `PreToolUse` hook silences the `Write` prompt for paths under `<project>/SCRATCH/` as intended. The hook is now the supported path; this investigation is archived.

If the upstream `Write` matcher is fixed in a future Claude Code release:

1. Add `Write(/SCRATCH/*)` back to `.claude/settings.json` and verify in a fresh session that the prompt is silenced.
2. If silent, follow the hook-removal procedure in [`REFERENCE/scratch-write-hook.md`](../../REFERENCE/scratch-write-hook.md) → "How to remove the hook (if upstream `Write` allow-list is fixed)".
3. Supersede [`REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md`](../../REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md) with a new ADR describing the upstream fix and the rollback.
