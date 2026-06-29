# Relay Operator CLIs
REFERENCE > Features > Relay Operator CLIs

The operator surface for the Relay agent's Stage-1 loop: run a session, read the pieces it writes into the human gate, and approve or reject them.

**Review now also has a UI:** the admin **"Relay Agent" tab** (Admin → Analytics Dashboard, behind the `is_admin` login) lists pending pieces with their bodies and lets you Approve/Reject them, and shows the decision log. Approve/Reject there proxy to the bridge via `POST /api/admin/relay/review` (admin-gated, using `RELAY_CONTROL_TOKEN`) — the same control-plane the CLIs use. **Session triggering is still CLI-only** (`relay:session`); an in-tab trigger needs an async (queue-based) runner because a session takes minutes — that's a follow-up. The CLIs below remain the way to run sessions and a scriptable alternative for review.

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

- **`relay:session <reader_id>`** — assembles the voice, ensures the Managed-Agent resources exist (environment/vault/agent, cached in the gitignored `.relay-agent-ids.json`), fetches the stimulus from `reader_items` (`short_summary` + `commentariat_summary`), runs one session, prints the **reasoning trace**, and finalizes the backend-observed decision. The raw transcript is saved to the gitignored `relay-sessions/<session_id>.json`. Pre-flights the bridge and fails fast with guidance if it's unreachable.
- **`relay:pieces [--all]`** — read-only. Prints each `pending_review` piece in full (body, summary, concepts, recall count) so you can read before approving, plus the recent decision log. `--all` includes approved/rejected pieces.
- **`relay:approve <piece_id>`** — embeds the body (the one sealed embed fn) and atomically sets `state=approved` + `slug` + `embedding`. The piece is now recallable as *self*. Re-drivable (a second approve errors cleanly).
- **`relay:reject <piece_id>`** — sets `state=rejected`; never embedded, never recalled.

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

## Related

- [architecture/workers.md](../architecture/workers.md) — the relay bridge worker and its routes
- `SPECIFICATIONS/relay/stage-1-technical-spec.md` — the Stage-1 design and reconciliation notes
