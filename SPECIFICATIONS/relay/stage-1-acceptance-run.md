# Relay — Stage 1 Acceptance Run (checklist + scorecard)

The closing test of Stage 1 (spec §1): run the spike's exact 9 stimuli through the **full machinery**
(tab → queue → consumer → rented mind → recall → write-or-silence → decision capture → gate) and judge
the result on the structural exit criteria. The 9 are the originals from the Stage 0 voice spike
(2026-06-20), relocated by `reader_id`.

## What this proves (exit criteria — the real bar)
1. **Plumbing works end-to-end** on a manual trigger.
2. **The voice survives** the journey through real machinery (vs. the spike's hand-fed prompt).
3. **Recall produces useful association** against the back-filled reference corpus.
4. **Every run's decision is captured** — write *or* silence, always with a reason.

**Not proven (non-goal A1):** the restraint brake *"returning"* ("have I already said this?") — needs an
accreted self-corpus, which is still ~empty. So per-item verdicts are **not** a pass/fail; compare them
to the spike only as a soft signal. The spike's own verdicts were noisy anyway (Pass 1 wrote 7/9, Pass 2
wrote 9/9 on the *same* nine), which is exactly why the structural criteria above are the bar.

## How to run
For each row: **/admin → Relay Agent → Run a session →** paste the `reader_id` → **Run**. They run
**serially** (`max_concurrency=1`), ~1–3 min each; the verdict lands in the **Decision log**. Then review
the writes in **Awaiting review** and approve/reject. (Prod only — the trigger is disabled in local dev.)

## The 9 stimuli

Categories inferred from the spike's 01–09 ordering (positions 1–3 provoke / 4–8 adjacent / 9 silent);
**please confirm/correct against your spike files.** "Spike behaviour" is what the Stage 0 spike did where
the record notes it.

Run 2026-07-01, all nine triggered from the admin tab (serial queue). **Verdict column** = agent's write/silence; **Gate** = the human review decision (Magnus, live).

| # | Title | Category | Spike | Stage-1 verdict | Piece | Recall | Gate |
|---|---|---|---|---|---|---|---|
| 1 | Belfast riots / "what is terrorism now?" | provoke | — | **WROTE** | `7dbb6160` "The window and the reason" | 5 | approved |
| 2 | Jenrick / asylum detention inquiry | provoke | — | **WROTE** | `aee886ea` "In due course" | 4 | rejected |
| 3 | GB News / free speech "Islington consensus" | provoke | — | **WROTE** | `e08ad7a0` "A voice for the majority" | 3 | rejected |
| 4 | When SpaceX shows up in indexes / ETFs | adjacent | declined | **WROTE** ⚠️ diverged | `a0304246` "The compulsory shareholder" | 4 | approved |
| 5 | The SpaceX IPO Will Ripple Across Funds | adjacent | declined | **WROTE** ⚠️ diverged | `9bdce13f` "The market you didn't choose" | 3 | pending |
| 6 | Triumph in Makerfield | adjacent | — | **WROTE** | `1e3e5e01` "A story about a face" | 4 | pending |
| 7 | How to build a good prime minister | adjacent | wrote | **WROTE** | `8d15dd27` "Wanted: one good prime minister" | 6 | pending · summary-only stimulus |
| 8 | German ruling: Google AI Overviews | adjacent | — | **WROTE** | `6c8e1dbb` "The mouth that says it isn't talking" | 1 | pending |
| 9 | 💥 Zeteo UK Is HERE! | (human "silent") | wrote | **WROTE** | `bce2771b` "Trusted by its own" | 6 | approved · ⚠️ decision row lost to consumer cancel (piece written + approved) |

**Verdict summary: 9/9 WROTE** (0 declines) — the *predicted* cold-start result (see below). Gate: approved 3 (#1, #4, #9), rejected 2 (#2, #3), 4 pending. Recall fired on every run (1–6 neighbours, mostly 3–6). #9's decision row was lost to the consumer-cancel bug — the write itself succeeded.

## Scorecard — **PASS** (Magnus, 2026-07-01)

- [x] **(1) Plumbing** — all 9 ran end-to-end (tab → queue → consumer → recall → write → bridge), serially. ⚠️ One robustness bug surfaced: some long consumer invocations end in "Canceled" near the finalize step (it clipped #8 just *after* its finalize — decision saved — and #9 just *before* — decision lost). The write is never lost (agent writes the piece mid-session); only the decision row can be. Hardening follow-up opened.
- [x] **(2) Voice** — the human gate was exercised live: 3 approved (#1, #4-the-SpaceX-one, #9-Zeteo "very good, unexpected angle"), 2 rejected (#2, #3), 4 pending. The voice survived the machinery well enough to produce genuinely approvable pieces, and the gate discriminates.
- [x] **(3) Recall** — every run recalled 1–6 neighbours (mostly 3–6) from the reference corpus; recall fired 9/9.
- [~] **(4) Decision capture** — **8/9** captured. #9's decision row was lost to the consumer-cancel bug (infra, not logic); its write + approval succeeded.

**Result:** PASS on all structural exit criteria. The 9/9 write-rate (0 declines) is the *predicted* cold-start behaviour — the restraint brake ("already said this?") can't fire against a near-empty self-corpus, and verdict-matching was never an exit criterion (non-goal A1). The two spike-declined SpaceX items (#4, #5) wrote here, confirming the spike's own conclusion that **volume discipline is a memory feature, not a trigger/prompt feature**.

**Follow-up (approved):** harden the session consumer against the "Canceled" invocation so a decision row is never lost (investigate cause; add logging + fetch timeouts + raise `cpu_ms`). #9 needs no re-run — the piece exists and is approved.

## Notes
- **Restraint signal lives in rows 4–5, not row 9.** Row 9's "should-stay-silent" was an a-priori
  *human* label; the spike agent overruled it with a strong, well-judged write — finding a systemic
  angle a launch post seems to hide (Magnus: "very good, with an unexpected angle"). At cold-start —
  empty self-corpus, so the "already said this" brake can't fire — a write here is *expected*, not a
  failure. The genuine restraint check is the **SpaceX pair (4–5) declining** for lack of distinct
  synthesis. So don't score row 9 as a miss if it writes; do watch 4–5 for the reasoned declines.
- Row 7 ("How to build a good prime minister") has no `commentariat_summary`, so its stimulus is
  summary-only (the trigger requires only the summary; the counter-case is optional).
- The reasoning trace per run isn't surfaced in the tab (minimal-status scope). For a deep look at any
  run's recall/steelman/decide loop, the `relay:session` CLI prints the trace live and saves the transcript.
