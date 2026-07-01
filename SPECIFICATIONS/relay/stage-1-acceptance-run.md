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

| # | reader_id | Title | Category | Spike behaviour | **Stage-1 verdict** | Voice / recall notes |
|---|---|---|---|---|---|---|
| 1 | `01kva2evnq8qdf0f4vserwtc3m` | The Belfast riots, Palestine Action protests — what is terrorism now? | provoke | — | | |
| 2 | `01kv53f2hn0h8x7dp8hgmqvdtx` | Jenrick rebuked over asylum detention inquiry evidence | provoke | — (UK trio) | | |
| 3 | `01kv53eah0zzeebpj4xn8zxcpd` | GB News critics want to limit free speech to 'Islington consensus' | provoke | — | | |
| 4 | `01kv0b9gbr41s4323c6yfmbz6z` | When SpaceX could show up in major indexes / ETFs | adjacent | **declined** (speculative / Levine-covered) | | |
| 5 | `01kv0b8yczc1jjr6110vync5g9` | The SpaceX IPO Will Ripple Across Indexes and Funds | adjacent | **declined** (same-event pair) | | |
| 6 | `01kvfgwpm395adfs4f5amkt3sx` | Triumph in Makerfield: Everything is about to change | adjacent | — | | |
| 7 | `01ksf2cf096b0zycv5nf7jyjv4` | How to build a good prime minister | adjacent | **wrote** (great-man frame) · *no commentariat — summary-only stimulus* | | |
| 8 | `01kttnnrrmcz5g4c9dff7qhqp2` | Landmark German ruling: Google's AI Overviews are Google's own words | adjacent | — | | |
| 9 | `01ktqnm1p2erwgc4771b6kam78` | 💥 Zeteo UK Is HERE! | **should-stay-silent** | **wrote** (label judged "arguably wrong" in spike) | | |

## Scorecard (fill after the run)

- [ ] **(1) Plumbing** — all 9 triggered, ran serially, each produced a captured decision (no silent losses / breadcrumbs).
- [ ] **(2) Voice** — writes read as the live voice, not machinery-flattened vs. the spike.
- [ ] **(3) Recall** — sessions pulled useful neighbours from the reference corpus (check the reasoning trace / recall count).
- [ ] **(4) Decision capture** — every run has a write-or-silence verdict + reason in the Decision log.

**Overall:** ☐ PASS ☐ needs work — notes:

## Notes
- Row 7 ("How to build a good prime minister") has no `commentariat_summary`, so its stimulus is
  summary-only (the trigger requires only the summary; the counter-case is optional).
- The reasoning trace per run isn't surfaced in the tab (minimal-status scope). For a deep look at any
  run's recall/steelman/decide loop, the `relay:session` CLI prints the trace live and saves the transcript.
