# Use of Managed Agents
REFERENCE > Architecture > Use of Managed Agents

How the **Relay** narrator subsystem uses Anthropic's **Managed Agents** — the rented "mind" that reads a stimulus, decides whether it has anything to say, and writes it. This is an educational deep-dive: the *why* and the *how*, not a line-by-line code tour. For the worker configs see [workers.md](./workers.md); for the subsystem's design intent see `SPECIFICATIONS/relay/stage-1-technical-spec.md`.

## The One Idea: Mind Rented, Memory Owned

Everything below follows from a single design choice:

- The **mind** — the reasoning, the voice, the judgement to write or stay silent — is a **Managed Agent**: a Claude Opus agent *hosted by Anthropic*. We don't run it; we rent it and drive it through an API.
- The **memory** — every reference the narrator has read, every piece it has written, every verdict — is **ours**, in the `relay_*` Postgres tables, sitting behind the **Relay bridge worker**.

Why split them this way? Because a rented mind is *disposable and swappable*, but memory must *persist and accrue*. Managed Agents is the harness today; the plan is to move to the Cloudflare Agents SDK later. If memory lived inside the harness, that swap would throw away everything the narrator has learned. By keeping memory behind the bridge, the swap becomes "rewrite the thin orchestrator, leave the memory alone."

The bridge is therefore called the **swappable seam**. This whole document is really about what lives on each side of that seam and how they talk across it.

```
   RENTED (Anthropic)              OWNED (us)
  ┌──────────────────┐        ┌─────────────────────┐
  │  Managed Agent   │  MCP   │   Relay Bridge      │
  │  Claude Opus     │ ─────► │   (the seam)        │
  │  + assembled     │        │   sole relay_*      │
  │    voice         │        │   writer            │
  └──────────────────┘        └──────────┬──────────┘
         ▲                          ▲     │
         │ create session,          │     ▼
         │ send stimulus, poll      │  relay_pieces / relay_references
  ┌──────┴───────────┐             │  relay_decisions
  │ Relay Orchestrator│────────────┘
  │ Durable Object    │  finalize verdict
  │ (holds the API key)│  via bridge /decision
  └───────────────────┘
```

## The Three Anthropic Resources

A Managed Agent isn't a single object — it's assembled from three resources, created **once** and then reused for every session. Provisioning happens through the Managed Agents API (base `https://api.anthropic.com/v1`), gated by the `managed-agents-2026-04-01` beta header. The created IDs are cached (locally in `.relay-agent-ids.json` for the CLI path; as `[vars]` in the orchestrator's wrangler config for production) so we never re-create them.

### 1. Environment — the sandbox the agent runs in

Created via `POST /environments`. Two settings carry all the security weight:

- `config.type = 'cloud'` — Anthropic runs the agent's container; we don't provision compute.
- `config.networking.type = 'limited'` with `allow_mcp_servers = true` and `allowed_hosts = []`.

That networking config is the important part: **the agent's container cannot reach the open internet.** Its *only* permitted egress is to declared MCP servers. So the narrator can't wander off and read arbitrary URLs — every external fact it gathers comes through a tool we wrote (`research`, `fetch`), which we control and can make fail *closed*. Package managers are disabled too.

### 2. Vault — where the bridge credential lives

Created via `POST /vaults`, then a credential is added with `POST /vaults/{id}/credentials`:

```
auth: { type: 'static_bearer', mcp_server_url: <BRIDGE>/mcp, token: RELAY_BRIDGE_TOKEN }
```

This is how the agent authenticates to our bridge **without us ever putting the token in the prompt or the agent config**. The vault holds the bearer token; Anthropic injects it into the `Authorization` header when the agent calls the MCP server.

> **The byte-identical rule.** The credential is *keyed* to the MCP server URL (`mcp_server_url`). When the agent connects to an MCP server, Anthropic matches the server's URL against the vault's `mcp_server_url` to decide which credential to attach. If they don't match **byte-for-byte**, no credential is attached, the agent connects *unauthenticated*, the bridge returns 401, and you get an `mcp_connection_failed_error`. This has bitten before — it's the first thing to check if sessions fail to reach the bridge.

### 3. Agent — the voice plus its tools

Created via `POST /agents` (and updated in place with `POST /agents/{id}`):

- `model: 'claude-opus-4-8'`
- `system:` the **assembled voice** (see next section)
- `mcp_servers: [{ type: 'url', url: <BRIDGE>/mcp, name: 'relay-bridge' }]` — this URL must match the vault credential's `mcp_server_url`.
- `tools: [{ type: 'mcp_toolset', mcp_server_name: 'relay-bridge', configs: [...] }]` — the five bridge tools, each `enabled` with permission policy `always_allow`.

`always_allow` matters because Relay runs **unattended**. A normal interactive agent might pause and ask "may I call this tool?"; the narrator has no human in the loop mid-session, so every tool is pre-authorised. The human check happens *after* the session, at the gate — not during it.

## The Agent's Mind: The Assembled Voice

The agent's `system` prompt is not one file. It's **five authored documents** (in `relay-agent/`) concatenated in a fixed, non-negotiable order:

| Order | Doc (role) | What it carries |
|-------|-----------|-----------------|
| 1. trunk | commitments & antagonisms | values, craft laws, what it defends and attacks |
| 2. grain | loves & tells | who it is at rest — the humour, the tells |
| 3. rings | continuity & memory | how it persists; reference-vs-self; **restraint** |
| 4. cadence | craft & cadence | plainness; the anti-tell list; a style exemplar |
| 5. coda | operating coda | where it stands this session; input-private/output-autonomous |

The order is deliberate: the *character* is established first (trunk/grain/rings), then craft-and-cadence corrects the **sound** — the character docs are written dense, and without correction the model would imitate that density. The operating coda comes last, closest to the work, because it's the actual instruction for the session.

### The Channel-1 exemplar

Appended to the cadence doc is one **curated exemplar** — a short passage of approved writing that shows "here is good prose in this voice." It's selected from the approved corpus and baked into the agent resource at provision time (so a running production session never re-rotates it). This is *Channel 1*: an agent-visible **positive** anchor.

It's paired with a deliberate blindness: the agent is **never** shown rejected work or edit-deltas. Those (Channel 2) are editorial-only, distilled by humans into the anti-tell list. The narrator sees what good looks like, never what was cut — so it can't learn to game the gate.

## A Session, End to End

The **Relay Orchestrator** (a Durable Object) drives one session at a time. Here's the full arc for a single stimulus:

1. **Trigger.** An admin clicks "Run a session" (or the Stage 2.3 archive-hook fires automatically). The main app — a *pure producer* — enqueues a `reader_id`. The app never touches the agent; it only names the stimulus.

2. **T0 stamp.** The orchestrator records `started_at` as `now − 30s`. This backward margin absorbs clock skew between the orchestrator and the database, and defines the window used later to attribute a written piece to *this* session.

3. **Fetch the stimulus.** The orchestrator reads the `reader_items` row and formats it into the "desk": title, summary, topical tags, the operator's note, and a counter-case. The summary is mandatory — an item with no summary is rejected before a session is spent, because there's nothing to react to. (Notably, the item's *rating* is deliberately excluded — a verdict on the desk's own output would bias the narrator toward feeling commissioned.)

4. **Create the session.** `POST /sessions` with the agent, environment, and vault IDs. Then `POST /sessions/{id}/events` sends the stimulus as a `user.message`: *"Today's desk: …"*.

5. **The agent works.** Inside its sandbox, using only the bridge's MCP tools, it typically: `recall`s neighbours (past references and its own approved pieces) to see what's already been said; `fetch`es full text where recall isn't enough; `research`es for grounded external facts; and then **either** `write_pending`s a piece **or** stays silent. Restraint is a first-class outcome — most stimuli should *not* produce a piece.

6. **Poll across alarms.** The orchestrator polls `GET /sessions/{id}` until the status is `idle` (done) or `terminated` (crashed). Crucially it polls **across Durable Object alarms**, not in a held loop — see [Why a Durable Object](#why-a-durable-object-and-not-a-queue-consumer) below.

7. **Read the transcript.** On `idle`, it reads the events: the recall queries, the neighbours returned, and the closing narration — the window into *how* it decided.

8. **Finalize the verdict.** The orchestrator calls the bridge `POST /decision` with the stimulus ref, `started_at`, the closing text, any `degraded` flag, and the sources consulted. The bridge derives the verdict **backend-side**: if a `pending_review` piece exists at/after T0, the verdict is `wrote` and the piece is linked; otherwise `declined`. A crash writes no row at all — *no row means the run died*.

The agent itself never learns the verdict. It wrote or it didn't; what became of the piece is invisible to it.

## The Two-Token Security Model

There are **two** bearer tokens, and keeping them separate is a real security boundary, not bookkeeping:

| Token | Who holds it | What it opens |
|-------|-------------|---------------|
| `RELAY_BRIDGE_TOKEN` | the agent's **vault** | `/mcp` (the five tools) + `/backfill` |
| `RELAY_CONTROL_TOKEN` | the **orchestrator** and operator CLI | `/decision`, `/approve`, `/reject` — the gate-bypassing control plane |

Why two? Because the human gate must stay **out of the agent's reach**. The agent holds only the bridge token, so even a fully compromised or misbehaving agent *cannot* approve its own writing — `/approve` requires the control token, which only the operator and orchestrator have. The narrator can propose (`write_pending`); only a human can promote (`relay:approve`). Separating the tokens makes that guarantee structural rather than hopeful.

## The Human Gate, and the Agent's Blindness

A written piece lands as `pending_review` with a **null embedding** — which means it is *not recallable*. It exists, but the narrator's future selves can't see it yet.

- `relay:approve <id>` → the bridge embeds the piece (through its sealed `bge-m3` path) and promotes it to `approved`. Only now is it recallable as "self", and eligible to become a Channel-1 exemplar.
- `relay:reject <id>` → marked `rejected`, **never embedded**, never recalled.

The agent is blind to all of this. No tool reports approval, rejection, or deployment. This blindness is deliberate: it keeps the narrator writing from conviction rather than for approval, and it prevents it from ever reverse-engineering what the gate rewards.

## Updating the Voice

Because the voice is authored prose, editing the narrator is editing Markdown — no code change. To activate an edit:

1. Edit a voice doc (e.g. `relay-agent/ansible-agent-craft-and-cadence.md`).
2. Run `npm run relay:session -- --push-only`.

`--push-only` re-assembles the five docs and calls `POST /agents/{id}` to update the agent's `system` in place, then **exits without running a session** — you activate a voice edit without spending a narrator run. The agent's version number bumps.

> Production picks it up automatically. Sessions bind by **agent ID**, not version — so the next production session created by the orchestrator uses the freshly-pushed voice, with no redeploy and no wrangler edit. (One cosmetic wrinkle: the version bumps on every push even when the prompt is unchanged, because the API echoes a normalised `tools` array that doesn't round-trip byte-identically. The running config is correct; only the version number drifts.)

## Why a Durable Object (and not a queue consumer)

Relay sessions originally ran in a Cloudflare **queue consumer**. It didn't work, for a physical reason worth understanding:

- A Managed-Agent session takes **~5 minutes** and its duration varies.
- Cloudflare **hard-cancels** a queue-consumer invocation at roughly **4 minutes**.

So the invocation died *mid-session*. The piece was often written ~1.5 minutes *after* the consumer let go — orphaned, with no decision row. Retrying would spawn a *duplicate* agent session.

The fix (ADR [2026-07-07](../decisions/2026-07-07-relay-orchestrator-durable-object.md)) is a single-threaded **Durable Object** with **alarm-driven polling**. The DO sets an alarm, wakes ~every few seconds to poll the session's status, and re-sets the alarm — so waiting out a 5-minute session never requires *holding* an invocation. Two properties fall out for free:

- **Serial by construction.** One DO instance = one session at a time = no lock table, no race. This is what makes the T0 time-window verdict attribution airtight (the bridge is structurally blind to which run a `write_pending` belongs to, so attribution *must* be window-based, which *requires* serialisation).
- **No held invocation, no hard-cancel.** The wall-clock problem simply disappears.

One deliberate wrinkle: the orchestrator's run ledger (`agent_session_runs`) is written **directly** by the DO, *not* through the bridge — a documented exception to "the bridge is the sole `relay_*` writer." The reasoning: the ledger is *mind-specific orchestration state* (session IDs, polling status), not owned memory. When the mind is swapped, the ledger's shape changes *with the orchestrator*, so it belongs on the orchestrator's side of the seam. It's even named out of the `relay_*` bucket to signal that.

## What the Seam Buys Us

Bring it back to the one idea. The seam is what makes the future swap cheap. When Relay moves from Managed Agents to the Cloudflare Agents SDK:

- **Changes:** the orchestrator (how a session is created and polled) and the provisioning of the mind's resources.
- **Stays exactly the same:** the bridge, the five MCP tools, the `relay_*` tables, the embedding path, the human gate, and every reference and piece the narrator has ever accumulated.

That asymmetry — a small, well-bounded thing changes while the valuable, accreted thing is untouched — is the entire payoff of routing every durable write through one worker. The rented mind is meant to be replaced. The owned memory is meant to last.

## Related Documentation
- [Overview](./overview.md) - System architecture and the five-worker layout
- [Workers](./workers.md) - Relay bridge and orchestrator worker configs
- [Database Schema](./database-schema.md) - The `relay_*` tables in detail
- ADR [2026-07-07-relay-orchestrator-durable-object.md](../decisions/2026-07-07-relay-orchestrator-durable-object.md) - Why sessions run in a Durable Object
- ADR [2026-07-01-relay-session-trigger.md](../decisions/2026-07-01-relay-session-trigger.md) - The pure-producer trigger and T0 attribution window
- ADR [2026-07-10-relay-single-owner-engagement-gate.md](../decisions/2026-07-10-relay-single-owner-engagement-gate.md) - The Stage 2.3 archive-hook auto-trigger
- Spec `SPECIFICATIONS/relay/stage-1-technical-spec.md` - The subsystem's mechanical design
