# [Packet title — short and descriptive]

> Skeleton for migration packets. Copy this file into a new `YYYY-MM-slug/` folder and rename to `README.md`, then fill in the sections. Delete this blockquote and any `[bracketed]` placeholders before committing. See [`../CLAUDE.md`](../CLAUDE.md) for authoring guidance.

**Status:** Active <!-- or "Superseded by: [link to newer packet]" -->
**Authoritative source:** [Link to merged PR(s) on GitHub]

---

## Why

[One short paragraph: what problem does the improvement solve, and what was the *before* state? Frame it for a reader who has never seen this template's recent history. The receiving Claude needs enough context to make sensible judgement calls when local files have diverged.]

## What changed

[Bullet list of the conceptual changes — not file-by-file. Examples:]
- [New skill / workflow added]
- [Existing file split into N pieces]
- [Config flag introduced with N states]
- [Renamed concept X → Y throughout the docs]

For the full diff, see the linked PR(s) above.

## File manifest

### Copy verbatim

Files that did not exist before this change. The receiving Claude should add them as-is, unless a same-named file already exists locally (in which case treat as *merge carefully*).

- `path/to/new-file.md` — [one-line purpose]

### Merge carefully

Files that almost certainly already exist in the target project but with different content. The receiving Claude must read the local version, identify the section(s) added/changed by this packet, and merge — not overwrite. Local customisations elsewhere in the file must be preserved.

- `path/to/existing-file.md` — [what section/concept was added or changed; e.g. "added 'Automated PR review system' section"]

### Conditional

Files that may or may not be relevant depending on whether the target project uses the related feature.

- `path/to/optional-file.md` — [condition under which to apply; e.g. "only if the project already has a project-config.json"]

## Apply prompt

> Copy the block below into the receiving project's Claude session. It is self-contained — the receiving Claude won't have access to this packet's surrounding context.

```
I want to roll out a template improvement to this project. The migration packet README is
at:

  [Direct URL to this packet's README.md on GitHub — blob/main/... form]

Source PR(s): [PR links]

How to fetch source files: use WebFetch on the raw GitHub URL pattern

  https://raw.githubusercontent.com/[OWNER]/[REPO]/main/<path>

substituting <path> for any file listed in the manifest (e.g.
`.claude/skills/review-gate.md`). Do NOT invent file contents — every source file must come
from the raw URL above.

Please:

1. WebFetch the packet README first and read it end-to-end. Understand WHY the change
   exists and WHAT changed before touching any file.
2. Create a feature branch (e.g. `feature/adopt-[slug]`). Do NOT work on main.
3. For each file in "Copy verbatim", check whether a file at that path exists locally.
   If not, WebFetch the source and create it. If it does, treat it as "merge carefully"
   instead and flag the conflict.
4. For each file in "Merge carefully", read the local version and WebFetch the source
   version. Identify the sections this packet adds or modifies, and propose a merged
   version that preserves any local customisation.
5. For each "Conditional" file, evaluate the stated condition before deciding.
6. Before writing ANY changes, list every proposed edit with a one-line rationale, and
   flag any place where local customisation would be lost. Wait for my confirmation.
7. After I confirm and you've applied the changes, run the verification commands from
   the packet and report results.
```

## Verification

Each check below should be a single shell command the receiving Claude can run and report on. Prefer `test -f`, `grep -q`, or other mechanical checks over English assertions.

```bash
# Examples — replace with packet-specific checks:
test -f path/to/new-file.md
grep -q "expected-string" path/to/existing-file.md
grep -q "ignored-pattern" .gitignore
```

Add at least one check that would catch a *partial* merge (e.g. a key added to one file but a corresponding reference missing from another).

## Notes for the receiving Claude

[Anything subtle that could trip up the rollout. Examples:]
- [Watch for renamed files that look like the old version]
- [This packet supersedes packet `YYYY-MM-other-slug` — apply this one instead]
- [If the target project is on an older variant where X is true, do Y differently]
