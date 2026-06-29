# Relay — Stage 1 Technical Specification (Walking Skeleton)

**Status:** Revised after `/review-spec` (verdict: **APPROVED WITH CONDITIONS**, unanimous) — conditions folded in. · **Date:** 2026-06-21 · **Branch:** feature branch before any code.

This is the engineer's technical spec for **Stage 1** of Relay, the autonomous narrator built on top of Ansible. It implements the smallest end-to-end slice of the conceptual memory-system spec.

**Read alongside:**
- Conceptual spec: [`../ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md`](../ORIGINAL_IDEA/ansible-relay-agent-memory-system-spec.md)
- Naming: [`../ORIGINAL_IDEA/ansible-relay-agent-the-name.md`](../ORIGINAL_IDEA/ansible-relay-agent-the-name.md)
- Persona (the system prompt): [`../../relay-agent/`](../../relay-agent/) — trunk / grain / rings / **craft & cadence** / operating coda
- Spike findings, guardrails, editorial design: project memory `relay-agent-*` notes.

---

## Implementation reconciliation (slice 3, 2026-06-29)

The body below is the original spec; these points record where the shipped Stage-1 implementation (PR #117) deliberately diverged. Read them as authoritative where they conflict with the prose:

- **The system prompt is a 5-doc assembly, not 3+coda.** A fourth voice doc — **craft & cadence** (`relay-agent/ansible-agent-craft-and-cadence.md`) — sits between the rings and the coda (`trunk → grain → rings → cadence → coda`). It corrects the model imitating the persona docs' high aphoristic density. (Affects §3, §6, and the diagram.)
- **The trigger stimulus is the item's summary + commentariat, not the full article body.** Ansible stores no article body, so `fetchStimulus` builds the trigger from `short_summary` + `commentariat_summary` (what the voice spike passed on). `fetchArticleContent` remains, but only serves the `fetch` *tool* for recalled references. Consequently §6's trigger-side Reader-failure alarm (422/401) has no trigger-path home. (Affects §1, §6.)
- **Stage-1 operation is via `relay:*` CLIs; the admin "Relay Agent" tab is still required but not yet built.** The interim operator surface is four scripts — `relay:session <reader_id>`, `relay:pieces`, `relay:approve <id>`, `relay:reject <id>` (the loop is fully operable through them). The tab (§1/§6/§7) remains in-scope for Stage-1 completion — it is **not** deferred to the blog phase — and is the next build. The one affordance the CLIs lack is the §6 token-health-alarm surface (acceptable only while sessions are run by hand). See `relay:*` runbook: [`../../REFERENCE/features/relay-operator-cli.md`](../../REFERENCE/features/relay-operator-cli.md).
- **Decision/approval auth is split across two tokens.** `/mcp` (+ `/backfill`) use `RELAY_BRIDGE_TOKEN`; the gate-bypassing control plane (`/decision`, `/approve`, `/reject`) uses a separate `RELAY_CONTROL_TOKEN`, so the agent's token cannot self-approve a piece.
- **Decision attribution (T0 window) assumes serial, manual sessions.** `finalizeDecision` links a `pending_review` piece created at/after a `started_at` stamp; with a backward skew margin this is exact only when sessions run one at a time. Concurrent/automated sessions (Stage 2) need a session-scoped marker.

---

## 1. Purpose, scope & exit criteria

Stage 1 delivers a **walking skeleton**: one real stimulus → the rented mind recalls from owned memory → writes a standalone piece or stays silent → every decision is captured → a written piece waits in a human gate → on approval it becomes part of Relay's own recallable memory. End-to-end, on a **manual trigger**, with recall working from day one against a back-filled reference corpus.

### Exit criteria (what Stage 1 proves — and what it does NOT)
Stage 1 is judged on: **(1)** the plumbing works end-to-end; **(2)** the voice survives the journey through real machinery (vs. the spike's hand-fed prompt); **(3)** recall against the reference corpus produces useful association; **(4)** every run's decision — *write or silence, with reason* — is captured.

**Explicit non-goal: Stage 1 does NOT demonstrate the restraint brake "returning."** The "have I already said this?" memory brake needs an accreted *self*-corpus, which starts empty (back-fill populates *reference* only). The brake becomes observable only after pieces accumulate — a later milestone, not a Stage 1 success condition. (Confirmed assumption A1.)

### Acceptance input
The **spike's exact 9 stimuli** (3 should-provoke / 5 adjacent / 1 should-stay-silent), so Stage 1 output is directly comparable to the spike's PASS verdict and isolates the single new variable: the machinery.

### In scope
- Owned-memory tables in Supabase (single-narrator namespace) with pgvector: `relay_pieces`, `relay_references`, `relay_decisions`.
- One-time back-fill of Ansible's existing summaries/commentary as **reference**.
- The **bridge**: an MCP-server Worker exposing a small fixed tool set; embedding sealed inside it.
- The **mind**: one Managed Agent (persona docs + minimal coda), reaching memory only through the bridge.
- **Backend-observed decision capture** (write/silence + reason) on every run.
- The **piece lifecycle** and **human review gate**, in the admin "Relay Agent" tab.
- Full-text stimulus: the triggering article's body fetched on demand via the Reader API.

### In scope, but built LAST (final step of Stage 1)
- The **blog** on echoreflex.me — anonymous, sparse, password-gated, static. Built right before the password comes off, because it is the biggest and highest-complexity chunk and is **not load-bearing during the gated phase** (Magnus reads pieces in the admin tab; agent-blindness holds regardless). It **backfills automatically from the entire approved backlog** in one deploy — deferring it loses nothing. See §8.

### Deferred to Stage 2/3 (NOT gaps — see §12)
Rollups; the editable lists; the frontier; the editor-agent panel; discourse search / automated fact-research; scheduled reading; webhook auto-trigger; automatic multi-item cross-cut; **the Stage 2 re-verification/prune pass over the self-corpus** (committed — §12, A2).

> **Stage 1 safety rests entirely on the human gate.** No automated fact-check or legal-hygiene step yet; every piece is human-read before it can become recallable, and (later) before the blog exists at all. Acceptable *only* during this protected phase.

---

## 2. Principles carried in (non-negotiable)

- **Mind rented, memory owned.** Loop on Managed Agents (beta); corpus/index in Supabase, outliving any harness. `relay_*` are permanent: no hard-delete of pieces; embeddings re-derivable behind the bridge.
- **The bridge is the swappable seam.** All durable state behind it; the mind reaches memory only through MCP tools. No MA-native memory stores for the corpus; no MA session state for anything durable.
- **The agent is blind to the gate.** Nothing it can see reveals the gate, the password, or the protected phase. Its tools report plain success. It must believe it publishes to the world. **Decision capture is backend-observed, never an agent action** (§6).
- **Situations, not people.** Enforced by the persona and, in Stage 1, by the human eye (manual gate, not automation — confirmed assumption A3).
- **Anonymous and unsigned.** No masthead, byline, or announced beginning.
- **Free tiers.** No new paid services; only per-session model inference costs (§10).

---

## 3. Architecture

```
  Ansible (exists)                         Relay (new, Stage 1)
  ───────────────                          ────────────────────
  reader_items                  manual      THE MIND  (rented — Managed Agent)
  (short_summary,    ──trigger──────────▶   system = trunk+grain+rings + minimal coda
   commentariat_summary,                    tools  = mcp_toolset(bridge) only
   + full body via Reader API)                    │ MCP (vault static-bearer)
        │                                          ▼
        │ one-time back-fill              ┌──────────────────┐
        │ as reference                    │   THE BRIDGE     │  MCP-server Worker (CF)
        ▼                                 │ recall · fetch   │  ONE sealed embed fn
  ┌──────────────────────────────┐       │ write_pending    │  (Workers AI bge-m3/1024)
  │ OWNED MEMORY (Supabase)       │◀─────▶│ ingest_reference │  service-role DB access
  │ single-narrator, RLS-ON,      │       └──────────────────┘
  │ zero-policy (service-role only)│              │
  │  relay_pieces · relay_references│             │ session ends →
  │  relay_decisions  (+ pgvector) │◀── backend observes outcome, writes relay_decisions
  └───────────┬────────────────────┘     (write or silence+reason; no row = crash)
              │ approve → embed-then-set state=approved (ONE tx) → recallable
              ▼
   REVIEW GATE (admin "Relay Agent" tab) ──approve──▶ [deploy step, built LAST]
   pending → [Magnus] → approved (recallable)         echoreflex.me (static, gated,
              └─reject → trace-less                     backfilled from approved backlog)
```

---

## 4. Data model

**Namespace.** Single-narrator. Does **not** use Ansible's `user_id`/RLS-policy multi-tenant model. New `relay_*` tables have **RLS *enabled* with zero policies** — `service_role` (the bridge) has `BYPASSRLS` and is the only reader/writer; `anon`/`authenticated` (the shipped client key) are denied everything. (This is the corrected form of the original "RLS disabled", which would have exposed `relay_pieces` — including pending/rejected — via the client-bundled anon key. Mirrors the codebase's existing pattern; `processing_jobs` already enables RLS.)

**pgvector.** Enable once: `CREATE EXTENSION IF NOT EXISTS vector;` (only `uuid-ossp` enabled today). On the Supabase free tier.

**Embedding dimension.** Workers AI `@cf/baai/bge-m3` → `vector(1024)`. One sealed embed function is used by **both** recall and approval-embed so vectors never drift (§5). Provider switch later = re-embed pass; acceptable, behind the bridge.

### `relay_pieces` — Relay's own work (self)
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `body` | text | the prose (markdown) |
| `summary` | text | frontmatter: short self-summary |
| `concepts` | text[] | frontmatter: concepts touched |
| `links` | jsonb | **machine-resolvable provenance** — the reference/piece ids that fed this piece (cheap seam now for the Stage 2 fact-prune; impossible to reconstruct later) |
| `state` | text | `pending_review` \| `approved` \| `rejected` |
| `verification_status` | text | default `'unverified'` — the hook the Stage 2 re-verify/prune pass filters on (A2) |
| `embedding` | vector(1024) | **null until approved** (gate↔index seam) |
| `slug` | text | set on approval |
| `deployed_at` | timestamptz | null until the blog deploy renders it; **decoupled from `approved`** |
| `created_at` | timestamptz | internal only (never shown publicly) |
| `decided_at` | timestamptz | approve/reject time |

> **`approved` = embedded + recallable** (the load-bearing event). **`deployed` is separate** (`deployed_at`) — a cosmetic render to the blog that may happen much later. **Recall-as-self filters `state = 'approved'`.** Pending/rejected are never recallable.

### `relay_references` — ingested reference (the world reporting in)
`id` · `origin` (`ansible_backfill` | `research`) · `source_ref` (e.g. `reader_id`) · `title` · `text` · `embedding vector(1024)` · `created_at`. Embedded on ingest (ungated).

### `relay_decisions` — every run's outcome (the restraint instrument)
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `stimulus_ref` | text[] | the `reader_id`(s) fed this run |
| `verdict` | text | `wrote` \| `declined` |
| `reason` | text | for `declined`: the agent's own closing reasoning (why it stayed silent); for `wrote`: optional note |
| `piece_id` | uuid fk null | set when `verdict='wrote'` |
| `degraded` | text null | e.g. `summary_only` when the body fetch failed (§6) |
| `created_at` | timestamptz | |

> **No row for a run = the session crashed.** A `declined` row = genuine restraint. This is what makes silence — the conceptual spec's primary success signal — measurable.

**ANN index.** `hnsw`/`ivfflat` on each `embedding`. Brute-force is fine at Stage 1 size; the index is cheap insurance.

---

## 5. The bridge (MCP-server Worker)

A Cloudflare Worker, **separate from the Ansible app**, same account, the only thing that touches `relay_*`. Speaks MCP; the Managed Agent consumes it via `mcp_servers` + a vault **static-bearer** credential.

**MCP transport & impl (decided slice 2, confirmed against June 2026 docs).** Managed Agents require the **Streamable HTTP** transport: a single endpoint (`POST /mcp`) that accepts JSON-RPC and returns `application/json` — *no* separate SSE GET stream is required. The bridge therefore hand-rolls a minimal MCP router (no Durable Objects, no `@modelcontextprotocol/sdk`, no Cloudflare `McpAgent`) alongside the existing `/backfill` route, reusing the same Bearer gate. Rationale: the four tools are stateless request/response, so the framework options' session machinery buys nothing and works against the swappable-seam intent (§9). The connector performs a full MCP `initialize` handshake (Anthropic's vault probe calls `initialize`) — so the router MUST implement `initialize` (protocol-version negotiation + capabilities + serverInfo), `notifications/initialized` (no-op), `tools/list`, and `tools/call`; only the *tools* MCP feature is consumed.

**Secrets it holds:** Supabase service-role key; Reader API token (for full-text fetch); the MCP bearer (rotatable; bridge host non-guessable). When the blog is built (§8), a 4th: a **Pages-scoped CF API token** for Direct Upload deploys.

**New binding:** the bridge Worker needs an `[ai]` binding (`env.AI.run(...)`) for `bge-m3` — no Workers AI binding exists in the repo today; called out so it isn't discovered mid-build.

**Tool surface — the entire set the agent sees (unchanged by the review):**

| tool | input | behaviour | returns |
|---|---|---|---|
| `recall` | `stimulus_text`, `k` | embed inside bridge (the one sealed fn); ANN over references + **approved** pieces | `[{id, kind: self\|reference, title, summary, concepts}]` |
| `fetch` | `id` | full text of one piece/reference; for a reference with a `source_ref`, the **full article body via the Reader API** (reusing `fetchArticleContent` — Reader API, not scraping) | `{id, kind, title, body/text}` |
| `write_pending` | `body, summary, concepts[], links` | insert `relay_pieces` `state=pending_review`, embedding null | plain success |
| `ingest_reference` | `source_ref, title, text` | embed + insert reference (ungated) | plain success |

- **`recall` is backed by a SQL function** (`relay_recall(query_embedding, match_count)`, migration `20260622_add_relay_recall_fn.sql`): a cosine-ranked `UNION ALL` over `relay_references` + **approved** `relay_pieces`, using the `hnsw` cosine indexes. The JS client can't express `ORDER BY embedding <=> query`, so this is the one round-trip. **Schema note:** `relay_pieces` has no `title` column, so recall returns `title=null` for self-pieces and leans on `summary`/`concepts` for the self corpus. Apply via the Supabase dashboard SQL editor (the established method — CLI history is out of sync).
- **`fetch` degrades, never aborts:** if the Reader-API body fetch fails, it returns the stored reference content with `degraded:'summary_only'` so a session proceeds on frontmatter (§6).
- **The embedding model is never visible to the narrator.** It asks for neighbours and receives pieces.
- **There is no `publish`/`promote`/`index`/`log_decision` tool.** Promotion happens backend-side on approval (§7); decision capture is backend-observed (§6). Both kept off the tool surface precisely to keep the agent blind to the gate.
- One sealed embed function serves recall *and* approval-embed — never two paths that can drift in model/dimension.

---

## 6. The mind (Managed Agent) & the run

- **Create once** (`agents.create`, store `agent_id` + `version`; never per run): `model: claude-opus-4-8`; `system` = trunk + grain + rings + a **minimal operating coda** (the "input private / output autonomous" framing from the spike, **without** the grandiosity "draw blood once" line — it fought the grain's craft laws and produced overwrought prose; the coda defers to the persona). `tools`: `mcp_toolset(bridge)` only.
- **Environment:** `cloud`, networking `limited` (allow only the bridge host). **Vault:** the bridge's MCP static-bearer, attached via `vault_ids`.
- **MA surface (confirmed against June 2026 docs, with two corrections):** remote `mcp_servers: [{type:"url",name,url}]` (exactly those three fields), **static-bearer credential from a vault** via `vault_ids`, and `environment: cloud` + `limited` networking all exist as specified. **Corrections from the research:**
  - **No `authorization_token` on the MA `mcp_servers` entry** — that field belongs to the *Messages API* MCP connector (a different surface). In MA, auth lives entirely in the vault: a `static_bearer` credential matched to the server **by URL** (`mcp_server_url` must be **byte-identical** to the `url` in `mcp_servers`; a mismatch makes MA connect *unauthenticated*, which our blanket Bearer gate then 401s → `mcp_connection_failed_error`). So in testing, a 401 means "URL mismatch", not "bad token".
  - **Each `mcp_servers` entry MUST be paired with a `{type:"mcp_toolset", mcp_server_name:"<name>"}` entry in `tools`**, or `agents.create` rejects the agent ("unreferenced servers / dangling toolsets").
  - With `networking: limited`, set `allow_mcp_servers: true` (or add the bridge host to `allowed_hosts`) or the container can't reach the bridge.
- **Validation ladder (de-risks the hand-rolled handshake — the part docs can't fully confirm) before spending a full MA run:** (1) local MCP Inspector / scripted curl against `/mcp` — proves the handshake is spec-shaped, zero Anthropic cost; (2) point the cheaper **Messages API** MCP connector at the bridge (same Streamable HTTP transport) — proves an Anthropic client accepts it; (3) then wire the full Managed Agent. Watch `protocolVersion` negotiation specifically — it's the most likely silent failure in a hand-rolled `initialize`.
- Residual build-time check: confirm the harness injects nothing gate-revealing into the agent's visible context (low risk — we own system + tools; promotion is backend-side).
- **Trigger (Stage 1):** **manual**, from the admin "Relay Agent" tab — pick one or a few `reader_items`, start a session.

### Stimulus assembly & the Reader-failure policy
The stimulus is **full article body (via `fetchArticleContent`) + summary + commentary**, so Relay reasons on the primary source. `fetchArticleContent` throws on 401/404/422/timeout; transient cases already retry (`fetchWithRetry`). Terminal policy (a real decision, confirmed):
- **422 "no body"** (normal for PDFs/videos/link-only saves) → **degrade to summary+commentary, proceed**, record `degraded='summary_only'` on the decision row.
- **401** (bridge token dead — affects *all* future sessions) → degrade still works, but **raise a loud token-health alarm in the admin tab**; never silently degrade forever.
- **429/5xx/timeout** → already retried; then **abort this run** (retryable later).
- **Mid-session finalist `fetch` failure** → proceed on that neighbour's frontmatter (losing one finalist is survivable).

### Session flow & backend-observed decision capture
`recall(stimulus)` → optionally `fetch` finalists → **either** `write_pending(...)` **or** end the turn with no piece (silence — the coda tells it to say so plainly and stop). No in-session embedding of own work (that waits for approval).

**When the session ends, the backend observes the outcome and writes one `relay_decisions` row** — `wrote` (linking the new `piece_id`) if a `write_pending` occurred, else `declined` with the agent's closing reasoning as the `reason`. The agent never calls this and stays blind. A crashed session leaves **no row**, so crash ≠ silence. (This is the team's improvement over an agent-called log tool: LLMs are unreliable at "do housekeeping before stopping," and backend observation also catches crashes.)

---

## 7. Piece lifecycle & human review gate

```
write_pending → pending_review ──approve──▶ approved   (embedded + recallable)  ──▶ [later] deployed
                               └─reject──▶ rejected    (no embed; never recalled; calibration-only)
```

- **Review UI:** Ansible admin → **"Relay Agent" tab** (sibling to Landing Page / Demo in `src/components/admin/AdminContent.tsx`), behind the existing admin login (reuses the hardened `is_admin` pattern). Lists `pending_review`; shows body + frontmatter; Approve / Reject; hosts the **decision log** and the **manual-trigger** control. Reject may carry a private calibration note. This is the **control plane** — inside Ansible by design; only the blog is the anonymous island.
- **On approve — atomic & re-drivable:** **embed first**, then a **single service-role transaction** sets `state=approved` + `slug` (+ keeps `verification_status='unverified'`) + writes `embedding` together. No "approved-but-unembedded" window can corrupt recall-as-self. Re-runnable from the admin tab without double-publish.
- **Deploy is a separate, idempotent step** (built last, §8): renders approved pieces to the blog and sets `deployed_at`. "Approved-but-not-deployed" is benign lag, not corruption.
- **Embed-ceiling guard:** bge-m3 caps at ~60k tokens; bodies over the limit are truncated for embedding (mirror Ansible's existing Perplexity content-truncation).
- **On reject:** `state=rejected`, never embedded, never recallable; calibration-only rows are equally protected by RLS (never reachable by `anon`).
- The agent observes none of this; `write_pending` already returned success.
- **This gate is Stage 1's sole safety layer** — the fact-check and the legal/naming check, performed by Magnus, until the Stage 2 automated equivalents land.

---

## 8. The blog (echoreflex.me) — built LAST

- **Sequenced to the final step of Stage 1**, right before the password comes off — which is when it first earns its keep (the real experiment begins when the password lifts). Building it last removes the biggest, highest-complexity chunk from the critical path without touching the core hypothesis.
- **Backfills from the corpus.** The deploy step renders **all `state='approved'` pieces** (ordered by `created_at`, dates not shown) — so the blog appears fully populated with the entire backlog in one deploy. Nothing is lost by deferring; the voice arrives with a body of work (fits the rings' "no announced beginning").
- **Static** Cloudflare Pages project, echoreflex.me as custom domain. Deploy = **CF REST Pages Direct Upload + the Pages-scoped token** (can't shell `wrangler` from a Worker); idempotent/retryable. No runtime link to Ansible/Supabase — nothing to trace back.
- **Password gate via Cloudflare Access** (email one-time-code to Magnus). No bylines, no public dates, no "about", no naming of Relay.
- The agent cannot reach the blog and does not know it is gated.

---

## 9. Back-fill (cold-start substrate)

One-time, service-role: read `reader_items` and `ingest_reference` each as `origin=ansible_backfill`, `source_ref=reader_id`.
- **Idempotent:** `source_ref` (= `reader_id`) is the dedup key — upsert, so a re-run never double-ingests.
- **Empty/partial summaries:** use whichever of `short_summary` / `commentariat_summary` exists (prefer both, concatenated with labels); **skip the item** if both are empty.

> Back-fill populates the *associative recall* substrate (reference) — **not** the self-repetition brake, which stays empty until Relay publishes (A1). And the substrate is unverified Perplexity content: recall material, not gospel.

**Operating the back-fill (runbook).** It runs *on the deployed bridge* via the shared-secret-gated `POST /backfill` route (service-role + AI binding live inside the worker). To trigger the one-time seed (or re-run it — it's idempotent on `source_ref`):

```bash
curl -X POST "$RELAY_BRIDGE_URL/backfill" -H "Authorization: Bearer $RELAY_BRIDGE_TOKEN"
# → {"scanned":N,"ingested":M,"skippedEmpty":S,"failed":F}
```

where `RELAY_BRIDGE_URL` is the deployed worker origin (the non-guessable `*.workers.dev` host) and `RELAY_BRIDGE_TOKEN` is the bridge secret. Deploy the worker first with `npm run deploy:relay-bridge`.

---

## 10. Cost posture

Supabase free tier (pgvector included; corpus tiny; no paid upgrade). Workers AI free allocation (`bge-m3`). Bridge + blog on Workers/Pages free tier. CF API/Pages tokens are free. **Only real spend:** Managed Agent / Opus inference per session — inherent to the rented mind, low-volume (rare triggers, most runs end in silence).

---

## 11. Portability checkpoints

Bridge is real MCP (consumable by Managed Agents now, the Cloudflare Agents SDK later). All durable state behind the bridge; nothing durable in MA primitives. Embedding sealed in the bridge. The only MA-specific surface is the thin trigger/session adapter — the part a future swap rewrites.

---

## 12. Deferred to later stages

- **Stage 2:** rollups; the editable lists; scheduled reading of admired voices via **RSS**; discourse search (broad + trusted, via the existing **Perplexity** integration); the **editor-agent panel** (merit/novelty + legal-hygiene/fact, using the graded freshness rubric in project memory); webhook auto-trigger; **and — committed (A2) — a re-verification/prune pass over the self-corpus, filtering on `verification_status`, when the fact layer lands.**
- **Stage 3:** the frontier of attention (candidate → promote → merge/demote → prune) with its steelman gate, structural discriminator, and visible change-record. Built last; most powerful and most dangerous.

---

## 13. Review outcomes & confirmed assumptions

`/review-spec` verdict: **APPROVED WITH CONDITIONS** (Requirements Auditor, Technical Skeptic, Devil's Advocate — unanimous). Conditions folded into the sections above:

- **C-RLS** → §4 (RLS enabled, zero policies). *Was the one blocking item; trivial fix.*
- **C-decision-log** → §4 (`relay_decisions`) + §6 (backend-observed capture). *Top must-fix; load-bearing for the hypothesis.*
- **C-atomicity** → §7 (embed-then-set in one tx; deploy decoupled/idempotent; one sealed embed fn; 60k guard).
- **C-permanence** → §4 (`verification_status`, machine-resolvable `links`) + §12 (committed Stage 2 prune). *Decision (a).*
- **C-reader-failure** → §6 (422/401/5xx split + finalist fallback).
- **C-backfill** → §9 (dedup key + empty-summary rule).
- **C-acceptance** → §1 (spike's 9 stimuli + exit criteria).
- **C-build-specifics** → §5 (`[ai]` binding, Pages Direct Upload + token, bearer rotation/host).
- **C-MA-surface** → §6 (mostly confirmed from current docs; residual light leakage check).
- **Scope** → §1/§8 (blog deferred to the final step; backfills from the corpus).

**Confirmed assumptions:**
- **A1** — restraint "returning" is NOT a Stage 1 exit criterion (empty self-corpus). ✔ confirmed.
- **A2** — the permanent self-corpus is seeded on unverified content; **committed** to a Stage 2 re-verification/prune pass (decision (a)). ✔
- **A3** — the no-naming closure is enforced by the **human eye** during the protected phase, not automation. ✔ accepted.
- **A4** — the agent has no expectation of seeing a just-written piece back in recall (it never sees the gate). ✔ intended.

**Residual open item (build-time, not blocking):** confirm the Managed Agents harness injects nothing gate-revealing into the agent's visible context.
