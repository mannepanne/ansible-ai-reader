# Relay — Stage 2.1: Fact-grounding & outward research (spec)

**Status:** REVISED post-`/review-spec` (2026-07-09) — three-lens review (Requirements Auditor · Technical Skeptic · Devil's Advocate) folded in. Was NEEDS-REVISION; this is the buildable revision.
**Roadmap:** [stage-2-roadmap.md](./stage-2-roadmap.md) Phase 2.1 · **North star:** [ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md](../ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md) §"Outward research"

## Problem

Relay reacts to a *summary of the world*, not the world. The spike's #1 gap: the agent treats the Perplexity
summary as ground truth and asserts specific facts it never checked. Fact-grounding is the biggest lever on
both trustworthiness (the precondition for ever relaxing the human gate) and the thinking-entity feel.

**What grounding buys, stated precisely (Devil's Advocate):** live retrieval reduces *fabrication* (the agent
stops inventing specifics) — it does **not** deliver *verification* (the agent still can't tell a true sourced
claim from a false one). The gain is real but narrower than "fact-checking"; the schema and the labels below
must not over-claim it.

## What already exists — and the three things the review found wrong in the first draft

- ✅ `relay_pieces.verification_status` (text, default `'unverified'`) and `.links` (jsonb) — real hooks.
  `relay_references.origin='research'` anticipated. `ingest_reference` built (disabled in the toolset).
- ❌ **`generateCommentariat` is NOT reusable to produce findings.** It returns prose; `PerplexityResponseSchema`
  is a Zod `.object()` that **strips** Perplexity's `search_results`/`citations`; and its prompt says *"accept
  the article's basic factual premise"* — anti-fact-checking. Reuse only the *retry/error pattern*, not the
  function or prompt. (`perplexity-api.ts:571`, `:32`, `:603`.)
- ❌ **The bridge cannot call Perplexity today** — no `PERPLEXITY_API_KEY` in `workers/relay-bridge.ts` `Env`
  or `wrangler-relay-bridge.toml`; the bridge never imports `perplexity-api` (and couldn't reuse its
  in-process `PQueue` anyway — different worker/isolate).
- ❌ **`fetchById` treats any `source_ref` as a Reader doc id** (`tools.ts:100-110`) — so a URL-keyed research
  ref fails to full-text and degrades to `summary_only` every recall. Must branch on `origin`.
- ⚠️ The agent **toolset** lives only in `scripts/relay-session.ts` (CLI); the orchestrator sets no tools —
  enabling tools in prod is a manual CLI step, not a deploy. RLS on `relay_*` is zero-policy (service-role only).

## Goals (2.1 delivers)

1. The agent gathers **verbatim, source-attributable facts** from the web before it writes.
2. Specific factual claims are **grounded in a quoted source**, and that provenance is **recorded** on the piece.
3. **Research consulted is recorded on every decision — including declines** (the north-star's highest-value
   silence: "someone I admire already made this point better").
4. Worthwhile found sources are **ingested** so today's research becomes tomorrow's recall.
5. The **human-gate reviewer can see** the grounding (status + provenance) to act on it.
6. **Naming/legal hygiene** discipline (prompt-level; the gate remains the safety mechanism).

## Non-goals (deferred — see Stage 3 outline)

- Not a truth oracle. The automated **re-verification/prune pass** that would upgrade `sourced`→`verified` is
  deferred (Stage 3). The human gate is the final check.
- **The curated *lists* as editable, growing state** — the admired-voices list, its standing-reading consumer,
  the `opposition`/structural-steelman anti-echo *guarantee*, and any admin-editable list table — **→ Stage 3.**
  2.1 ships only a **seeded trusted-source config** (below).
- Not the frontier, rollups, or removing the human gate.

## Design

### A. The `research` tool — fact-finding, verbatim quotes only
New agent-facing MCP tool on the bridge, alongside `recall`/`fetch`. **Output contract (load-bearing — all
three reviewers):**
```
research(query: string, k?: number)
→ { findings: [ { quote: string, source_url: string, source_title: string } ], degraded?: string }
```
`quote` is a **verbatim extracted span** attributable to `source_url` — never model prose. This is what makes
grounding real rather than "trust a second Perplexity paraphrase." Backed by a **new grounded-search function
in the bridge worker** (a direct Perplexity `sonar` call + retry, with a response schema that **preserves**
`search_results`/`citations`, and a parser that pairs quoted spans with their source). Reuses the *pattern* of
`perplexity-api.ts`'s retry/error handling, not the module.
- **Fact-finding only.** `intent`/modes collapse to one tool: `opposition` is dropped (the stimulus already
  carries the Perplexity `commentariat_summary` counter-view); `admired` → Stage 3.
- **Steering:** the query prioritises the **trusted-source config** (D) — e.g. `site:` biasing / prompt
  preference — but is not limited to it (facts sourced across the spectrum, per the north-star).
- **Fails CLOSED (Requirements Auditor):** on Perplexity error/timeout/empty, return `{ findings: [],
  degraded: 'research_unavailable' }`. The coda discipline (E) forbids grounding a specific claim on a missing
  source — so a failed search produces a hedge or a silence, never an unsourced assertion.
- **Bounded:** a soft per-session cap (coda) + a hard per-call timeout (B) so research can't run a session away.

### B. Bridge Perplexity wiring
Add `PERPLEXITY_API_KEY` to `workers/relay-bridge.ts` `Env`, to `wrangler-relay-bridge.toml` secrets (set
manually like the other bridge secrets), and thread it through `bridgeDeps()` → `ToolDeps`. The research call
runs **synchronously inside the MCP `tools/call`** the agent is blocking on, so: bound retries (≤2) and the
per-attempt timeout (≤30s) to stay inside the **Managed-Agent per-tool-call timeout** — **verify that limit**
(it, not the ~15-min orchestrator poll budget, is the binding constraint).

### C. `ingest_reference` re-enable + the fetch collision fix
- Re-enable `ingest_reference` in the agent toolset.
- **Require a stable `source_ref` (the source URL) for `origin='research'`**, and **normalise** it before it
  becomes the dedup key (lowercase host, strip trailing slash, drop tracking params, `http`→`https`). If a
  finding has no stable URL, **don't ingest** (never insert a null-source duplicate).
- **Fix `fetchById`:** branch on `origin==='research'` → return the stored `content` directly (its content
  *is* the retrieved snippet; there is no Reader body). Removes the doomed Reader round-trip. Correct
  regardless of the dedup decision.

### D. Trusted-source config (not a table)
For 2.1 the trusted-source list is a **seeded config** (a checked-in seed / bridge var), *not* a DB table with
an admin tab — because RLS is zero-policy, so a browser tab would mean new authenticated control-plane routes,
not thin UI (Technical Skeptic). The editable, growing list (and admired-voices) is **Stage 3**.

### E. Grounding & hygiene discipline (coda)
Coda additions (prompt-level, minimal — deferring to the persona): ground a specific factual claim on a
**quoted** source, never on the research tool's summary; **if research failed or found nothing, do not assert
the specific — hedge or stay silent**; prefer the plain sourced fact over the confident guess; naming/legal
hygiene (situations-not-people; care with victims/the dead — [[relay-agent-guardrails]]). **Prompt-only; the
gate is the safety mechanism**, the coda only reduces how often Magnus must catch something.

### F. Provenance, `verification_status`, decision sources
- **`links` shape (define it):** tagged objects `[{ type: 'recall' | 'source', ref: string, title?: string }]`
  (`ref` = a recall UUID or a source URL). `write_pending` accepts this; the surface and the future prune read
  the `type`.
- **`verification_status` — backend-derived, honest values (all three).** Set **inside `write_pending`**
  (agent stays gate-blind) from whether `links` carries any `type:'source'`: `'sourced'` if yes, else leave
  `'unverified'` (default). **Reserve `'verified'`** for the deferred re-verification pass. No enum needed
  (text column); document the value set. Do **not** use `'grounded'` (reads as "true").
- **Decision sources (capture declines — Magnus's call):** add `relay_decisions.sources` (jsonb). The
  orchestrator extracts the research sources the agent consulted **from the session transcript** (extend
  `session-readout`/`readSession`) and passes them to the bridge `/decision`; `finalizeDecision` stores them —
  so **every** run (write *and* silence) records what it read. On a decline that's the only provenance there is.

### G. Admin-tab surface (close the visibility gap — Requirements Auditor)
The reviewer must be able to *see* grounding: `src/app/admin/page.tsx` selects `verification_status` (+ the
decision `sources`); `RelayAgent.tsx` renders a **status badge** (`sourced`/`unverified`), the piece's
**`links`** resolved for humans (recall refs → titles, source refs → clickable URLs), and the decision's
sources on the log. Without this, "the human gate is the final check on grounding" is not deliverable.

## Data model changes
- **New:** `relay_decisions.sources` jsonb (default `'[]'`).
- **Documented, no schema change:** `links` tagged-object shape; `verification_status` values
  (`unverified` | `sourced` | reserved `verified`).
- **No `relay_lists` table** (config instead — deferred to Stage 3).

## Blast radius, latency, cost
- **New secret on the bridge** (`PERPLEXITY_API_KEY`) — set manually + CI, like the other bridge secrets.
- **Latency:** the binding constraint is the **MA per-tool-call timeout** (research holds the MCP request
  open), *not* the orchestrator poll budget — bound retries/timeout accordingly + verify the limit.
- **Toolset-update-in-prod is an explicit rollout step** (below), not a deploy side-effect. Verify the MA API
  resolves an unversioned `agent` to its latest version (else the CLI bump won't reach the pinned
  `RELAY_AGENT_ID`); echo the agent version so drift is observable.
- **Cost:** capped research calls/session; monitor.

## Open questions (remaining)
1. The Managed-Agent **per-tool-call timeout** value (drives the retry/timeout budget in B).
2. The per-session **research-call cap** (soft, via coda) — start ~3.
3. **Conflicting sources:** present both quoted / decline the specific / prefer the trusted-source finding? (Lean: present both, let the writing hold the tension — but state a default.)

## Testing
- `research` grounded-search fn (injected backend): verbatim-quote shape; empty/error → `{findings:[], degraded}` (fail-closed); trusted-source steering.
- `fetchById` origin-branch: a `research` ref returns stored content, no Reader call.
- `ingest_reference` dedup: `example.com/x` and `example.com/x/?utm=1` → one row (normalisation).
- `write_pending`: derives `verification_status='sourced'` iff a `type:'source'` link is present.
- Decision sources: transcript research extracted → stored on `relay_decisions` for both write and decline.
- Admin surface: pending piece shows status badge + resolved links; decision log shows sources.
- Live smoke: agent researches, grounds a quoted claim, ingests a source, declines-with-recorded-sources.

## Rollout
1. Migration: `relay_decisions.sources` — Supabase SQL editor.
2. Bridge: `research` tool + grounded-search fn; `PERPLEXITY_API_KEY` env/secret; `fetchById` origin-fix; `ingest_reference` dedup + normalisation.
3. **Agent toolset (explicit prod action):** update the prod agent resource to enable `research` + `ingest_reference` (CLI against prod; confirm agent-id + version; document the step). *Not* a deploy side-effect.
4. Coda: grounding + hygiene discipline.
5. Admin surface: status badge + resolved links + decision sources.
6. Seed the trusted-source config; live smoke; verify grounding + provenance visible in the tab.
