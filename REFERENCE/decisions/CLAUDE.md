# Architecture Decision Records (ADRs)

Auto-loaded when working with files in this directory. Documents architectural decisions and their reasoning.

---

## What are ADRs?

**Architecture Decision Records** capture the reasoning behind significant technical choices. They prevent re-debating decisions by documenting:

- What was decided
- Why this came up
- What alternatives were considered
- Why this option won
- What trade-offs were accepted

**Key insight:** Written reasoning compounds. Opinions evaporate.

---

## When to create an ADR

**Create an ADR when making decisions that:**
- Affect architecture beyond today's PR
- Choose between meaningful alternatives (library, pattern, API design)
- Involve significant trade-offs
- Decide NOT to do something (equally important)
- Will constrain or enable future work

**Don't create for:**
- Tactical implementation details (belongs in code comments)
- Obvious choices (no alternatives considered)
- Easily reversible decisions
- Preferences without reasoning

**Rule of thumb:** If you spent >15 minutes debating it with reasoning, it probably deserves an ADR.

---

## How it works

### When decision is made

**Claude's role:**
1. Recognize when a decision "outlasts today's PR"
2. Prompt: "This decision affects future architecture. Should I create an ADR in REFERENCE/decisions/?"
3. User confirms or declines
4. If confirmed, Claude creates ADR using template format

**User's role:**
- Confirm when Claude suggests ADR
- Or request ADR explicitly: "Let's document this decision"

### Before making similar decision

**Search precedent first** using the Grep tool on `REFERENCE/decisions/`:
- Search for the topic keyword (e.g. "library", "authentication", "queue")

**Follow existing ADR unless:**
- New information invalidates the reasoning
- Context has changed significantly
- Trade-offs no longer apply

**If superseding:** Create new ADR referencing the old one, mark old as "Superseded"

---

## ADR format

**Filename:** `YYYY-MM-DD-{topic}.md` (chronological + descriptive)

**Example:** `2026-03-29-jwt-authentication.md`

**Template:**
```markdown
# ADR: {What you decided}

**Date:** YYYY-MM-DD
**Status:** Active | Superseded | Deprecated
**Supersedes:** (if applicable)

---

## Decision

[One sentence: what was decided]

## Context

[Why this decision came up. What problem are we solving?]

## Alternatives considered

- **Option A:** [Description] - [Why not this]
- **Option B:** [Description] - [Why not this]
- **Chosen: Option C:** [Description] - [Why this won]

## Reasoning

[Detailed explanation of why this option was chosen]

[Key factors that influenced the decision]

## Trade-offs accepted

[What we gave up by choosing this]

[Limitations or constraints this introduces]

## Implications

[What this enables going forward]

[What this prevents or makes harder]

---

## References

- Related ADRs: (if applicable)
- External resources: (if applicable)
- Relevant specs: (if applicable)
```

---

## ADR Index

**Format:** Listed chronologically (newest first)

- **[2026-07-10-relay-single-owner-engagement-gate.md](./2026-07-10-relay-single-owner-engagement-gate.md)** — Why the Stage 2.3b archive-hook trigger (which lives in the shared `performSyncForUser` path) is scoped to an explicit `RELAY_OWNER_USER_ID` rather than `is_admin` (GDPR: never feed another user's engagement to the narrator); why the enable-toggle is a default-off boolean on the owner's `users` row rather than a new `app_settings` table; why the engagement filter reads the **live** `reader_items.rating` column, not the stale `item_signals` log (a deliberate deviation — un-rating skips the signal insert, so a lifted 🤷 veto would never lift); and why a low-harm double-enqueue across overlapping owner syncs is accepted rather than locked out.
- **[2026-09-06-fika-signed-action-links.md](./2026-09-06-fika-signed-action-links.md)** — Why the Fika email's action buttons use an HMAC-signed, expiring token as the credential (no session, so a tap from an unsigned-in phone inbox works) with a GET-renders / POST-writes split (so link prefetchers never act); the accepted exposure under the single-user threat model; and the tightening to apply if the user base widens.
- **[2026-07-09-read-only-reviewer-agents.md](./2026-07-09-read-only-reviewer-agents.md)** — Why reviewer agents are read-only (a shared contract forbidding `git checkout`/`switch`/`stash`/`reset`/`rebase` and everything that moves `HEAD`) and why `/review-pr` + `/review-pr-team` additionally spawn reviewers with `isolation: "worktree"` while `/review-spec` deliberately doesn't; why `permissions.deny` and `safety-harness.sh` were rejected (session-wide, can't tell a subagent from the operator). Fixes a `git checkout` bug that stranded commits on the wrong branch.
- **[2026-07-09-fan-out-review-synthesis.md](./2026-07-09-fan-out-review-synthesis.md)** — Why reviewer agents fan out and report to an orchestrator instead of debating each other; the collaborative-discussion phase is removed, the orchestrator dedupes by `file:line` and reconciles severity, and unresolved disagreements surface to the human rather than being negotiated away. Removes `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
- **[2026-07-07-relay-orchestrator-durable-object.md](./2026-07-07-relay-orchestrator-durable-object.md)** — Why Relay sessions run from a single-threaded Durable Object (serialization structural, polling via alarms) rather than re-enqueue/cron; and why its `agent_session_runs` ledger sits OUTSIDE the bridge (mind-specific orchestration, not owned memory) — a documented deviation from "bridge = sole `relay_*` writer". Includes the exclude-claimed-pieces attribution guard.
- **[2026-07-01-relay-session-trigger.md](./2026-07-01-relay-session-trigger.md)** — Why triggering a Relay session runs in a dedicated queue consumer (app stays a pure producer) rather than a long app request or a self-polling loop; why `max_concurrency=1` + `max_retries=0` are correctness settings (they protect the `T0` verdict-attribution window), and why `T0` is stamped in the consumer.
- **[2026-05-09-job-type-per-operation.md](./2026-05-09-job-type-per-operation.md)** — Why every meaningfully different queue operation gets a new `job_type` enum value and consumer branch (instead of a smart-worker or a separate synchronous endpoint); the dispatch contract every future operation should follow. Resolution of TD-002.
- **[2026-04-26-scratch-write-pretooluse-hook.md](./2026-04-26-scratch-write-pretooluse-hook.md)** — Why a project-local `PreToolUse` hook silences `Write(/SCRATCH/*)` prompts; the upstream `Write` matcher empirically does not honour allow-list entries (five sightings). Hook is the supported path until upstream is fixed; ops at `REFERENCE/scratch-write-hook.md`
- **[2026-04-26-allowlist-pinning-principle.md](./2026-04-26-allowlist-pinning-principle.md)** — When adding to `permissions.allow`, pin to specific subcommands for binaries with `-c`/`-e`/`-m` style code-eval (`python3`, `node`, `bash`); allow at binary level for pure data transformers with no shell-out (`jq`, `grep`). Per-binary risk table included
- **[2026-04-25-pr-review-threat-model.md](./2026-04-25-pr-review-threat-model.md)** — Why permissions and reviewer-agent severity defaults are calibrated for a single-contributor or small-trusted-team setting, what's in/out of scope, and the tightening checklist for derivative projects whose contributor model differs
- **[2026-04-22-prreviewmode-opt-in-config.md](./2026-04-22-prreviewmode-opt-in-config.md)** — Why `prReviewMode` is a tri-state enum (`enabled` / `disabled` / `prompt-on-first-use`), why the template default is the prompt state, why there's a gitignored local override, and why the gate logic is canonical-not-copied
- **[2026-04-22-tiered-pr-review-dispatcher.md](./2026-04-22-tiered-pr-review-dispatcher.md)** — Why `/review-pr` triages into light/standard/team tiers, why the rubric lives in a prompt, and why `/review-pr-team` stays independent
- **[2026-04-05-no-fk-constraints-on-analytics-tables.md](./2026-04-05-no-fk-constraints-on-analytics-tables.md)** — Analytics tables are independent with no FK constraints; simplifies RLS and GDPR deletes
- **[2026-04-05-cookie-free-localStorage-analytics.md](./2026-04-05-cookie-free-localStorage-analytics.md)** — Custom-built cookie-free analytics over third-party tools (Plausible, PostHog, GA)
- **[2026-04-05-direct-anon-supabase-client-for-tracking.md](./2026-04-05-direct-anon-supabase-client-for-tracking.md)** — Public tracking hooks use direct anon Supabase client, not the SSR client used elsewhere
- **[2026-04-05-tailwind-v3-for-shadcn.md](./2026-04-05-tailwind-v3-for-shadcn.md)** — Use Tailwind v3 (not v4) for landing page/demo UI; shadcn/ui compatibility

---

## Example ADR

See [TEMPLATE-adr.md](./TEMPLATE-adr.md) for a complete example.

---

## Integration with other docs

**ADRs complement:**
- **SPECIFICATIONS/** - Plans reference ADRs for context ("We're doing X because of the 2026-03-15-typescript decision")
- **REFERENCE/** - How-it-works docs reference ADRs for "why this way"
- **Code comments** - Link to relevant ADR for architectural choices
- **PR descriptions** - Mention ADR if decision was made during PR work

**ADRs are permanent:**
- Committed to version control
- Survive compaction, crashes, months
- Searchable and linkable
- Build institutional knowledge over time

---

## Best practices

**Writing ADRs:**
- Be specific about alternatives (not "considered other options")
- Explain reasoning clearly (someone reading 6 months later should understand)
- Include trade-offs honestly (every choice has downsides)
- Use British English
- Keep concise but complete

**Maintaining ADRs:**
- Never delete (mark as Superseded instead)
- Update index in this CLAUDE.md when adding new ADR
- Link related ADRs together
- Reference from specs/docs where relevant

**Using ADRs:**
- Search before making similar decision
- Follow precedent unless context changed
- Create new ADR if superseding old decision
- Link to ADRs in PR descriptions for context

---

## Credits

Inspired by:
- [Michael Nygard's ADR pattern](https://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions)
- LinkedIn post about preventing re-debate of settled decisions
- Experience with Claude Code sessions losing decision context
