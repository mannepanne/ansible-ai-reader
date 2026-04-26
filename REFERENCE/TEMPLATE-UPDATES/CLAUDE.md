# Template updates library

Auto-loaded when working with files in this directory. Migration packets that propagate improvements from this template repo into derivative projects (forks, copies, or projects that were bootstrapped from an earlier version of the template).

## What this folder is for

When a meaningful improvement lands in the template — a new skill, a reworked workflow, a config mechanism, a structural rename — derivative projects often want the same change. They don't share git ancestry with the template, so a cherry-pick won't work. A **migration packet** fills that gap: a self-contained, conceptually-framed brief that the receiving project's Claude can read, compare against local files, and apply with sensible judgement about pre-existing customisations.

Each subfolder below is one such packet, named with a date prefix and a short slug.

## Folder layout

```
TEMPLATE-UPDATES/
  CLAUDE.md                ← this file: index + author/apply guide
  TEMPLATE.md              ← skeleton to copy when authoring a new packet
  YYYY-MM-slug/            ← one packet per improvement
    README.md              ← the packet itself
    (optional supporting files: diffs, before/after snippets, verification scripts)
```

## Index of packets

### [2026-04-pr-review-triage/](./2026-04-pr-review-triage/)
**What it rolls out:** The tiered PR review system (smart triage dispatcher + light/standard/team tiers), the `prReviewMode` opt-in flag, and the extracted `review-gate.md` single source of truth.

**When to apply:** If a derivative project still has the older `/review-pr` (no triage) and/or the gate logic duplicated inside `.claude/CLAUDE.md`.

### [2026-04-threat-model-and-safety-harness/](./2026-04-threat-model-and-safety-harness/)
**What it rolls out:** A documented threat model that calibrates reviewer-agent severity defaults, a coherent set of silence-the-prompts conventions (Tool invocation conventions, allowlist tuning including the pinning-principle ADR, dispatcher Read-then-Write fallback, `WebFetch` granted to spec-review agents only), a PreToolUse safety-harness hook with a 39-fixture test suite, and a PreToolUse SCRATCH-write hook with a 6-fixture (7-test) suite that compensates for an upstream `Write` matcher defect. Bundles PRs #18, #19, #21, #22, #23, #24, #25, #30, #31, #32, #33, #34 plus the standalone silence/threat-model groundwork commits between them.

**When to apply:** After `2026-04-pr-review-triage` has landed (this packet builds on the triage system). Apply if the derivative project still has reviewer agents flagging worst-case findings without a documented threat model, `/review-pr` runs that prompt the user repeatedly, the SCRATCH/ Write prompt is still firing despite allow-list entries, no safety net against destructive commands, or hasn't yet adopted the TEMPLATE-UPDATES system itself. The packet is idempotent — re-applying on a project that already has an earlier shape of it picks up only the new pieces (typically the SCRATCH-write hook, its ADR, the ops doc, and the investigation log).

---

## Authoring a new packet

When a template improvement should be propagated:

1. **Wait until the work has landed on `main`** (merged PRs, not draft branches). Migration packets reference the *final* shape of the change, not work-in-progress.
2. **Copy [`TEMPLATE.md`](./TEMPLATE.md)** into a new folder named `YYYY-MM-slug/` (e.g. `2026-07-test-coverage-bump/`). The date prefix gives chronological ordering; the slug is short and descriptive.
3. **Fill in the sections.** The packet is for a Claude in another project — assume it knows nothing about this template's recent history. Lead with *why* before *what*. Link the merged PR(s) as the authoritative source.
4. **Group the file manifest into three buckets:**
   - **Copy verbatim** — files that don't exist in the target project and should be added as-is (typically new skills, agents, ADRs).
   - **Merge carefully** — files that likely exist in the target project but with different content; needs section-level merging, not overwrite.
   - **Conditional** — files that may or may not be relevant depending on whether the target project uses a related feature.
5. **Write the apply prompt** — the literal text the user will paste into the receiving project's Claude. Make it self-contained: the receiving Claude won't see this template's CLAUDE.md.
6. **Add an entry to the index above** in this file.

## Applying a packet (in a derivative project)

When you (the user) are in a derivative project and want to pull in a packet:

1. Open the packet's `README.md` in this template repo (e.g. via GitHub web or a local clone).
2. Copy the **apply prompt** from that file into the derivative project's Claude session.
3. Paste in the file manifest and PR links along with it.
4. Let the receiving Claude do the comparison and propose edits. It should flag any conflicts with local customisations *before* writing — review those flags first.
5. Run the **verification steps** at the bottom of the packet to confirm the rollout landed cleanly.

## Conventions

- **Date prefix** uses `YYYY-MM` (not full date). Multiple packets in the same month is fine; sort lexicographically by slug.
- **British English** throughout, matching the rest of the project's docs.
- **Evergreen language** — describe what the change *is*, not "the recent triage refactor". A packet read two years from now should still make sense.
- **Don't archive applied packets** — they remain useful as reference for future derivative projects. If a packet is truly superseded by a later one, add a `**Superseded by:** [link]` line at the top of its README rather than deleting it.
