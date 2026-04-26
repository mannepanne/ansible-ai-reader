# Review system gate logic

Canonical state machine for the opt-in flag that gates every `/review-*` skill. This file is the single source of truth — skill `SKILL.md` files reference it at their Step 0 rather than duplicating the logic.

**Related reading:**
- Overview: [`.claude/CLAUDE.md`](../CLAUDE.md) → "Automated PR review system"
- User-facing docs: [`REFERENCE/pr-review-workflow.md`](../../REFERENCE/pr-review-workflow.md) → "Configuration"
- ADR: [`REFERENCE/decisions/2026-04-22-prreviewmode-opt-in-config.md`](../../REFERENCE/decisions/2026-04-22-prreviewmode-opt-in-config.md)

---

## Gate logic (runs at Step 0 of every `/review-*` skill)

Every `/review-*` skill must, as its very first action, run the gate below before doing any other work. The gate is defined here once — do not duplicate it into the skill files. Each SKILL.md's Step 0 should be a one-line reference to this file plus the skill's own name for message substitution.

**Read order:**
1. Read `.claude/project-config.json` (the committed file).
2. If `.claude/project-config.local.json` exists, read it too and merge its top-level keys on top of the committed file's values (local wins). A missing local file is fine — just use the committed values.

**Branch on the resolved `prReviewMode` value:**

- **Both files missing, OR `prReviewMode` key missing from both** → treat as `"prompt-on-first-use"` (fresh-clone default). Render the pitch.
- **JSON unparseable in either file** → treat as `"prompt-on-first-use"`, warn the user which file needs fixing (name the file and the parse error). Then render the pitch.
- **`"enabled"`** → proceed with the skill's normal behaviour.
- **`"disabled"`** → reply with this line, substituting the invoking skill's name: *"The review system is disabled for this project (set via `prReviewMode` in `.claude/project-config.json`). Not running `/<skill-name>`. To re-enable, change the flag to `\"enabled\"`."* Stop. Do not continue into the skill.
- **`"prompt-on-first-use"`** → render the pitch (verbatim text below). Wait for `yes` / `no` / `later`:
  - `yes` / affirmative → persist `"enabled"` (see "Persist semantics" below), then proceed.
  - `no` / negative → persist `"disabled"`, emit the disabled message, stop.
  - `later` → do NOT modify any config file. Proceed with this invocation only.
- **Any other value** → warn the user the flag is malformed (show the current value and the file it came from), render the pitch as if the value were `"prompt-on-first-use"`, and persist the chosen answer.

**Persist semantics.** When the gate persists a new value:
- **Write target.** If `.claude/project-config.local.json` exists, write to *that* file (the presence of a local override file is a signal the user wants their changes kept local). Otherwise write to the committed `.claude/project-config.json`.
- **Write contract.** Read the full JSON of the target file, replace only the top-level `prReviewMode` string, write back. Preserve `_meta` and every other field byte-for-byte. Do not reorder keys, do not strip trailing newlines, do not change indentation.

---

## Local override — `.claude/project-config.local.json`

The committed `.claude/project-config.json` governs what cloners inherit. But the template repo itself (and any project where a maintainer wants to dogfood reviews while keeping a different committed default) needs a way to override locally without touching the checked-in file.

`.claude/project-config.local.json` is gitignored. When present, the gate merges its top-level keys on top of the committed file's values — local wins. A typical local override contains exactly one key:

```json
{ "prReviewMode": "enabled" }
```

Commit intent stays in `.claude/project-config.json`; per-clone dogfooding goes in the local file. A local override that matches the committed value is a no-op and can safely be deleted.

---

## The pitch

**Use this text verbatim when prompting the user — preserve the `>` blockquote markers, they produce the indented visual styling.**

Lead-in line (always render *before* the blockquote, on its own line, plain text — not part of the quote):

> The project's `prReviewMode` is set to `"prompt-on-first-use"`, so before I {{action}}, I need to ask:

Where `{{action}}` is the smallest natural description of what triggered the prompt — e.g. *"run the review on PR 15"*, *"open this PR"*, *"continue with the review skills"*. If no specific action is in flight, fall back to *"go any further"*.

The blockquote pitch itself:

> This template ships with an automated PR review system:
> - `/review-pr` triages each PR (~30s) then runs a light/standard/team review (1–5 min). Catches bugs, security issues, and doc gaps.
> - `/review-pr-team` forces a full multi-perspective team review (2–7 min) for critical changes.
> - `/review-spec` reviews a feature spec before you write code (2–7 min).
>
> These cost tokens. For throwaway experiments they're overkill;  
> for meaningful or long-lasting projects they pay back the first time  
> they catch a real issue.
>
> Enable for this project?
> - **yes** → I'll persist `"enabled"` to `.claude/project-config.json` and run this review now
> - **no** → I'll persist `"disabled"` — all `/review-*` skills will become no-ops from now
> - **later** → I'll run this one now and ask again next time

Closing question (always render *after* the blockquote, on its own line, plain text — not part of the quote):

> Which would you like — yes / no / later?

**After the user answers**, run the persist semantics above with the chosen value. For a `"later"` answer, do not modify any config file — the flag stays `"prompt-on-first-use"` and the pitch can be re-raised at the next review-adjacent moment (see Layer 1 triggers in [`.claude/CLAUDE.md`](../CLAUDE.md) → "Automated PR review system").
