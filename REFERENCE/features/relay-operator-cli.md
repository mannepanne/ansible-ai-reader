# Relay Operator CLIs
REFERENCE > Features > Relay Operator CLIs

The operator surface for the Relay agent's Stage-1 loop: run a session, read the pieces it writes into the human gate, and approve or reject them.

**The admin "Relay Agent" tab is now the primary surface** (Admin → Analytics Dashboard, behind the `is_admin` login): a **"Run a session"** control triggers a run, and pending/approved/rejected pieces can be reviewed and approved/rejected (incl. re-decisions) with a paginated decision log. Each piece card also shows a **Reader deep-link** to the source article and a collapsible **reconstructed stimulus** (what the piece was written from). The stimulus is *reconstructed* with today's `formatStimulus`, not the exact text sent — a piece written before an assembler change (e.g. pre-2.3a `Tags`/`Note`) renders lines it never saw, so the UI labels it "reconstructed (current logic)". Approve/Reject/Run proxy to the backend via admin-gated routes (`/api/admin/relay/review`, `/api/admin/relay/run`) using `RELAY_CONTROL_TOKEN` / the `RELAY_QUEUE` binding.

**How the tab trigger runs a session (vs. the CLI):** the tab enqueues a `reader_id` on `ansible-relay-queue`; the `ansible-relay-session-consumer` worker runs the session (serial — `max_concurrency=1`, `max_retries=0`) and finalizes via the bridge. See [ADR 2026-07-01](../decisions/2026-07-01-relay-session-trigger.md). The trigger works **in production only** (the queue binding isn't available under local `next dev`). The `relay:session` CLI below remains the way to run sessions locally, to update the agent's voice, and as a scriptable alternative.

**Engagement-gated auto-trigger (Stage 2.3b).** Beyond the manual "Run a session" control, the tab has an **auto-trigger switch** (default **OFF**). When on, each sync's final phase scans items you've newly *archived in Reader* and enqueues a Relay session for any that carry a strong engagement signal — a 💡 rating, a note (Ansible- or Reader-authored), or ≥1 highlight — while a 🤷 not-interesting rating vetoes. Meh archives and batch headline-dumps don't fire. Turning the switch on means **react from here forward** — enabling baseline-stamps the existing backlog as "seen," so only items you archive *after* flipping it on trigger a session (no burst of everything you engaged with while it was off; Run a specific backlog item manually if you want it). It is **owner-scoped**: the trigger only ever runs for the user in `RELAY_OWNER_USER_ID` (a non-owner's private engagement never feeds the narrator — GDPR), and no-ops entirely if that env is unset. The hook is self-healing (a crashed or failed enqueue is retried next sync; skips and successes are stamped once). Triggered reactions still land in this review gate — nothing publishes unattended. Ratings are used only to decide *whether* to react; they never enter the prompt (gate-blindness). Full design: [stage-2.3-archive-hook-spec.md](../../SPECIFICATIONS/relay/stage-2.3-archive-hook-spec.md) + the [single-owner ADR](../decisions/2026-07-10-relay-single-owner-engagement-gate.md).

All four are thin local CLIs run via `tsx`; they read secrets from `.dev.vars` and talk to the deployed **relay bridge** worker (see [architecture/workers.md](../architecture/workers.md) → Worker 4). They never write `relay_*` directly — every durable write goes through the bridge.

## The loop

```bash
npm run relay:session <reader_id>     # run one session on a stimulus (writes a piece, or stays silent)
npm run relay:pieces                  # read pending pieces (full body) + the decision log
npm run relay:approve <piece_id>      # embed the piece + promote it to recallable-as-self
npm run relay:reject  <piece_id>      # mark the piece rejected (never embedded, never recalled)
```

A typical pass: run a session → if it wrote, `relay:pieces` to read the piece and copy its `id` → `relay:approve`/`relay:reject` that id.

## What each does

- **`relay:session <reader_id>`** — assembles the voice, ensures the Managed-Agent resources exist (environment/vault/agent, cached in the gitignored `.relay-agent-ids.json`), fetches the stimulus from `reader_items` (`short_summary` + `tags` + the operator note + `commentariat_summary`, via the shared `formatStimulus`), runs one session, prints the **reasoning trace**, and finalizes the backend-observed decision. The raw transcript is saved to the gitignored `relay-sessions/<session_id>.json`. Pre-flights the bridge and fails fast with guidance if it's unreachable.
- **`relay:pieces [--all]`** — read-only. Prints each `pending_review` piece in full (body, summary, concepts, recall count) so you can read before approving, plus the recent decision log. `--all` includes approved/rejected pieces.
- **`relay:approve <piece_id>`** — embeds the body (the one sealed embed fn) and atomically sets `state=approved` + `slug` + `embedding`. The piece is now recallable as *self*. Re-drivable (a second approve errors cleanly).
- **`relay:reject <piece_id>`** — sets `state=rejected`; never embedded, never recalled.

## Activating a voice change (editing the persona docs)

The voice lives in `relay-agent/*.md` (trunk/grain/rings/cadence/coda) and the curated exemplars in `src/lib/relay/exemplars.ts`. **Editing those files changes nothing the live agent does** — the system prompt is assembled and pushed to the Managed-Agent resource only when `relay:session` runs. To activate an edit:

```bash
npm run relay:session <reader_id>   # reassembles the voice and pushes it to the pinned agent
```

`ensureResources` (`scripts/relay-session.ts`) **always** updates the agent on a run — the tools array round-trips non-identically, so the Managed-Agents version bumps on every run even when the prompt is unchanged — so a run is guaranteed to push whatever the docs currently say. The new version is cached in the gitignored `.relay-agent-ids.json`.

**Production picks the change up automatically — no redeploy, no config edit.** `createSession` (`src/lib/relay/session-run.ts`) binds a session to the agent by **ID, not version**, and `wrangler-relay-orchestrator.toml` pins only the agent *ID* (stable across version bumps). So the orchestrator's next scheduled session runs against the latest agent version — the one the `relay:session` push just created. There is nothing to edit in wrangler and no deploy to trigger.

Two consequences worth knowing:

- **This is a local action.** The agent ID lives in the gitignored `.relay-agent-ids.json`, so the push must run from a machine with `.dev.vars` credentials — CI does not (and today cannot) do it, because it has no agent ID and would create an orphan agent.
- **A push currently also runs a full session** — there is no push-only mode, so activating a voice edit costs one narrator inference run and may write a piece into the gate. Run it against a `reader_id` you are content to have narrated, or discard the resulting piece.

Caveat: the auto-pickup relies on the Managed-Agents API resolving "session against an agent ID with no version" to the *latest* version — which the code assumes (it never pins a session version). If you need certainty rather than inference, verify empirically: the CLI prints the new `vN`, and the next production post should reflect the change.

## Secrets (`.dev.vars`)

These CLIs read from `.dev.vars` (gitignored):

| Var | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | session | Managed Agents API |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` | session, pieces | read `reader_items` / `relay_*` |
| `RELAY_BRIDGE_TOKEN` | session | the agent's `/mcp` token (stored in the MA vault) |
| `RELAY_CONTROL_TOKEN` | session, approve, reject | the **control-plane** token for `/decision`, `/approve`, `/reject` |
| `RELAY_BRIDGE_URL` | all | optional override of the bridge origin |

The two tokens are deliberately separate: the agent only ever holds `RELAY_BRIDGE_TOKEN` (for `/mcp`), so a compromise of the agent's credential cannot reach the gate-bypassing control plane. The same `RELAY_CONTROL_TOKEN` must be set as a worker secret on the bridge (and as a GitHub CI secret) or the control routes 401.

## Notes

- **Sessions are serial and manual in Stage 1.** Decision attribution uses a timestamp window that is exact only when one session runs at a time.
- **Reasoning history** is in the per-session transcript (`relay-sessions/`) and printed live; `relay:pieces` shows the decision log but truncates the stored reason.
- **The bridge must be deployed** (`npm run deploy:relay-bridge`) with the routes and `RELAY_CONTROL_TOKEN` set before these work; `relay:session` pre-flights and tells you if not.

## Diagnostics (acceptance runs / debugging)

Read-only helpers (query `reader_items` / `relay_*` directly via the service role; never write):

```bash
npm run relay:acceptance-check <reader_id...>   # validate stimuli exist + have summary/commentariat
npm run relay:run-status <reader_id...>         # per-run outcome: verdict / failure breadcrumb / pending
npm run relay:pending                           # newest relay_pieces (state, recall count, title) — spot orphans
```

`relay:run-status` reads both `relay_decisions` (the verdict) and `sync_log` `relay_session_failed`
breadcrumbs, so it distinguishes "still running" from "failed". `relay:pending` surfaces a piece written
without a decision row (the "Canceled"-invocation failure mode — see [workers.md](../architecture/workers.md) Worker 5).

## Related

- [architecture/workers.md](../architecture/workers.md) — the relay bridge worker and its routes
- `SPECIFICATIONS/relay/stage-1-technical-spec.md` — the Stage-1 design and reconciliation notes
