# Ansible Agent — Memory System (conceptual specification)

> This is the conceptual specification of the system that gives the narrator its memory —
> written for the engineer, and specifically for the Claude that built Ansible and will write
> the technical specification in that environment. It is the companion to the three persona
> documents — *Commitments & Antagonisms* (the trunk), *Loves & Tells* (the grain), and
> *Continuity & Memory* (the rings) — and exists to implement them; it is **not** itself part
> of the narrator's system prompt. It says what the memory must *do* and *be*, not which
> primitive to reach for; the primitives are yours. Where it names Cloudflare or Anthropic
> services, read them as orientation, not instruction.

## What you are building

**Ansible** is an existing personal reading pipeline, built by the operator on Cloudflare: it
syncs articles the operator saves in Readwise Reader, uses Perplexity to generate a summary and
tags for each — and, when the operator asks, a counter-summary arguing against the piece — and
lets the operator rate and annotate what comes through. You built it, or its near-twin, and this
document assumes that environment and extends it rather than starting fresh.

What you are adding is a **public blog written by an autonomous agent** — the narrator described
in the three persona documents — drawing its commentary from the archive Ansible already holds:
the articles, their summaries, and their counter-summaries. It is explicitly an **art project and
an experiment** in autonomous agents, not a utility, a news service, or a journalistic product.
That framing is load-bearing. It is why the system is built to broadcast into the dark rather
than court an audience, to publish rarely rather than often, and to be judged on the quality and
consistency of a single voice across years rather than on reach. Design for clarity and for that
voice; nothing here needs to scale, monetise, or optimise engagement.

**Your task** is to turn this conceptual specification into a concrete technical specification,
and then an implementation, for that Cloudflare-and-Ansible environment. This document defines
what the memory must *do* and *be*; the primitives are yours. The closing section, *Left for the
technical specification*, enumerates the decisions and artifacts you are expected to produce.

## The documents, and how they compose

Four files describe this agent, and you arrive with no context but these four and the operator's
direct instructions — so read all four in full before you design anything; none is optional, and
this spec assumes the other three. Three of them are the narrator and ship inside the system
prompt; this fourth one is the engineer's brief and stays out of it.

- **Commitments & Antagonisms (the trunk)** — behaviour under pressure. What the narrator
  defends, what it attacks, and what it will not do even when it would land. Its values, held
  as conduct.
- **Loves & Tells (the grain)** — who the narrator is at rest. Its voice, taste, humour, and
  tells, and the things it loves that the trunk's teeth exist to guard.
- **Continuity & Memory (the rings)** — who the narrator is across time: how it persists, what
  it accumulates, what may change and what must not. All three persona documents are equally
  load-bearing for the system prompt and must be read in full; the rings is simply the one with a
  mechanical counterpart in this spec, because it is the narrator-facing description of the very
  machinery this document builds. When the rings say "the mind palace, not the archive" or
  "foregrounding, not forgetting," they are stating the behaviour your store and retrieval must
  produce. Read the rings and this spec as one system from two sides — the narrator's experience
  of its memory, and the engineering that delivers it — but do not let that pairing tempt you to
  skim the trunk and the grain, which fix the values and the voice that every stored and
  retrieved word exists to serve.
- **This document** — the memory system spec. Not part of the prompt; it exists to make the
  other three true.

Trunk and grain are the fixed identity — values and voice, the lens nothing reaches the page
without passing through. The rings is identity too, but it is also the doorway into this
document, because continuity is the one part of the character that words in a prompt cannot
deliver alone: it needs a store, an index, and a loop. So everything below — the layers, the
session, the bridge, the frontier — is in service of a single line from the rings: a mind that
holds everything, foregrounds a handful at a time, develops and never repents.

One caution, to avoid a collision of vocabulary: the *three documents* above are not the *three
layers* in the next section. The documents are the authored source; the layers (Identity,
Foundation, Working) are the runtime stack the agent assembles each session. All three documents
fold into the Identity layer; the accreting archive and the moving watched-list that the rings
*govern* live in Foundation. The instructions are fixed; the content they shape grows.

## The architecture in one line

**The mind is rented; the memory is owned.** The reasoning loop runs on a hosted agent harness
(Anthropic's Managed Agents) that wakes, thinks, writes, and sleeps — so the agent loop,
sandbox, and tool execution are not yours to build. The memory — the corpus, the index, the
accreting rings — lives where Ansible already lives, on Cloudflare, and must outlast any single
session, any harness, any beta. A thin bridge connects the two. Hold those three things apart
and the rest follows.

## The three layers

The agent's mind at any moment is three layers stacked, and it pays to keep them distinct.

- **Identity** — fixed. The trunk, the grain, and the rings: values, taste, and the rules of
  continuity — the lens everything passes through. This is the system prompt and it does not
  change. (The accreting archive and the moving watched-list the rings govern are not part of
  identity; they live in Foundation.)
- **Foundation** — standing, slowly growing. The curated lists (trusted fact-sources, admired
  voices, watched systems), the whole accreted archive of pieces and references, and the rollups
  in which understanding consolidates. What the agent trusts, has absorbed, and has come to
  understand. Its living parts grow like the trunk's systems list — seeded, curated, grown from
  use, pruned — and it lives in the store as editable state, not hardcoded, so it evolves
  without redeploying the mind.
- **Working** — per session, ephemeral. The stimulus, the recalled memory, the fresh research.
  Assembled to write one piece, then the durable parts fold down into the foundation.

Identity acts on foundation-and-working to produce the opinion; every opinion produced becomes
foundation for the next. That loop is why the thing has rings.

## What the memory is made of

A semantic substrate with a light, inspectable layer on top — not a keyword archive (plain
lexical search — the "search engine raking an index" the rings explicitly rejects in favour of
the mind palace) and not a hand-built typed graph (more apparatus than this art project wants).

- **The corpus of record.** Every published piece (self) and every ingested source (reference),
  stored durably and permanently. This is the source of truth and the publish target, and it is
  an *extension of the existing Ansible archive*, not a new island beside it.
- **The frontmatter layer.** Each piece carries a short summary, the concepts it touched, and
  the links it used. Written by the narrator at publish time. This is the cheap-to-scan surface
  — what the spotlight reads before deciding what to illuminate fully.
- **The vector index.** An embedding of each piece and source, so conceptual nearness is
  computable. This is the mind palace made queryable — the single thing that turns the archive
  associative instead of lexical.
- **Concept rollups.** The seat of understanding — a synthesis per standing concern of what the
  agent has come to grasp across everything written and read on it, including how that grasp has
  moved. Not a stored verdict (the stance is still re-inhabited from the pieces themselves) but a
  *map* that orients before the agent goes down into the territory. Authored in the agent's own
  understanding-voice — the lens is applied in the synthesising, which is what makes a rollup a
  worldview rather than a Wikipedia stub — yet derived and regenerated from the pieces on the
  scheduled run, never edited in place and never monumentalised. The deepest are the cross-cutting
  ones (*capture, then extract*, under both enshittification and the AI land-grab): the adjacency
  made explicit, the worldview writing itself down. The periodic regeneration is also the closest
  thing to honest "forgetting" — nothing lost, only restated more compactly as it settles.
- **The lists.** The foundation's editable state — trusted fact-sources (priority external
  references such as Wikipedia, consulted and never rebuilt), admired voices, watched systems.
  Short, curated, grown from use; they steer both research and recall, and they live in the
  store rather than in code, so they change without a redeploy.

Where these lists are seeded matters, because not all of them live in the persona documents. The
**watched systems** begin from the trunk's own list of concerns — the organised denial of
climate change, enshittification, the wholesale AI appropriation of creative work, and the rest —
and then grow and contract by the frontier mechanism described below. The **trusted fact-sources**
and the living **admired voices** (current minds read as they publish) are *not* found in the
persona documents and are the operator's to supply at setup: the grain's cultural lineage —
Vonnegut, Carlin, Baldwin and the others — is taste and reference, the shelf the voice was built
on, not a feed of present-day work to ingest. Seed all three lists as editable state in the
store, never in code.

## How a piece gets written (the session)

One stimulus, one session:

1. **Trigger.** A webhook starts the session. The stimulus is the thing on the desk — one
   newly archived article, or a few.
2. **Inward recall, in two stages.** Stage one: embed the stimulus, query the index, read the
   neighbours' *frontmatter* rather than their full text, and surface the rollups for the
   concerns it touches — the map, the palace lighting up, cheap and associative, the step where
   "foregrounding, not forgetting" is implemented. Stage two: with that orientation in hand, load
   the full text of only the handful of finalist pieces and reread them — the territory —
   recovering stance from the narrator's own prior reasoning, which is why total recall matters
   and what the self-doubt has to chew on.
3. **Outward research,** the live reading, in three kinds. *Fact-finding* against the
   trusted-source list — ground to stand on, sourced across the spectrum, never a debunking
   exercise. The *admired voices* — read alongside, to sharpen, as sparring partners and never
   authorities. And *other voices* by general search — the strongest version of the view it
   means to oppose, which the trunk requires, plus the unaffiliated middle — weighed by
   power-on-the-ground, not by who is loudest. Throughout: read to feed judgment, never to
   source it.
4. **The decision to publish at all.** Better-informed now, restraint can fire from either
   side — the pattern shows the thing has been said before, or the research shows someone it
   admires already made the point, and better. Silence unless it has a genuinely distinct
   synthesis. Memory and research are both brakes; most stimuli should produce nothing.
5. **The writing,** with silent links pulled from everything surfaced — inward to self, outward
   to the sources and voices it engaged.
6. **Consolidation.** Re-file: store the piece, write its frontmatter, embed and index it,
   update any affected rollup — and ingest the worthwhile sources it found as new reference, so
   today's research becomes tomorrow's recall. Skip this and the archive grows but stays dark.

## The bridge

The harness reaches the memory through a small, fixed set of tools — conceptually one MCP
server, itself a Worker in the same Cloudflare account as Ansible. It exposes roughly:
query-the-index, fetch-by-id, write-piece-with-frontmatter, embed-and-index, update-rollup. The
embedding call lives *inside* the bridge, so the narrator never thinks in vectors — it asks for
neighbours and receives pieces. Anthropic makes no embedding model of its own and points to
Voyage as its recommended provider; Cloudflare offers its own; any competent one works. The
choice is made once, behind the bridge, and the narrator never sees it.

## Triggering

Two clocks, two jobs. The **stimulus is event-driven**: when Ansible ingests new articles it
fires a webhook that starts a session — faithful to the narrator, whose trigger is the new
thing on the desk and not a calendar. **Consolidation is timer-driven**: a low-frequency
scheduled run that regenerates rollups and tidies the index. The same run does one more thing:
it reads — on a cadence it pulls the admired voices' recent work into the reference archive, so
the narrator is *always already reading* the minds it trusts instead of summoning them
mid-argument. Stimulus on the event; smoothing, the standing reading, and the cool management
of the frontier (below) all on the clock.

## The frontier of attention

The watched-systems list is not seeded once and left; it manages itself, growing and contracting
as the agent recognises new instances of the patterns it hunts. This is the most powerful
mechanism here and the most dangerous, so it is built to manage *down* as much as up. Four moves:

- **Propose.** In-session, when a stimulus surfaces something both adjacent in the index to an
  existing concern *and* recognised as a real instance of a values-pattern, the agent logs it as
  a *candidate* — not a member — with the evidence that raised it. The adjacency is the
  geometry's; the values-judgment is the agent's.
- **Promote.** On the scheduled run, a candidate that has recurred across several stimuli with
  real evidence may be promoted to a watched concern — never on a single piece, never in the heat
  of writing. Hot eyes in the session, cool hands on the schedule.
- **Merge and demote.** Concerns that prove to be one pattern fold into a shared cross-cutting
  rollup; a concern that stops yielding live instances is demoted to dormant — out of the active
  spotlight, never deleted.
- **Prune.** A soft cap and a use-it-or-lose-it decay hold the active list to a person's handful
  of real preoccupations rather than an ever-growing ledger of complaints.

Two gates keep the growth honest, and they are not optional: an agent that expands what it
attacks, feeds its own output back as memory, and reads mostly the voices it admires is the
standard recipe for radicalisation. The **steelman gate** — before promotion the agent
researches the strongest opposing case (the *other voices* type) and promotes only if a genuine
power-on-the-ground injustice survives it; a concern the best counter-argument dissolves was
grievance, and is dropped. And the **structural discriminator** — candidacy needs a recognised
pattern weighed by power on the ground, never the volume of offence. Both are the trunk's own
rules, here turned to guard the agent against itself; the narrator's standing self-doubt is their
affective twin.

The list stays structural. Concerns are systems, roles, and patterns — "the concentration of
media ownership," "the capture of frontier-AI rule-making by its incumbents." Named people
appear only as evidence inside a concern, under the trunk's naming rules, never as entries.

The frontier keeps a visible record of every promote, merge, and demote, with its reason — both
because a worldview's frontier shifting across years is the thing most worth watching, and
because it is the operator's window onto the mechanism and the place to step in if ever needed.
Not self-citation, not audience-tracking: the rings, made legible.

## The narrator's identity

The three persona documents — trunk, grain, rings — are the agent's standing instructions: the
system prompt, with the more procedural parts (house style, how to consolidate) optionally
delivered as skills. This specification is the fourth file in the set but is not part of that
prompt; it is the engineer's brief. The agent's own published work feeds back into the corpus
and the index, which is how the voice sharpens over time with no one tuning it by hand.

## What not to build

Each of the following is a plausible feature this design deliberately leaves out. The omission is
a decision, not an oversight — do not add them back in the name of completeness.

- **No prediction ledger, no forecasting apparatus,** nothing forward-looking. The narrator
  diagnoses and prescribes; it does not bet. (See *The revisit*, in the rings.)
- **No threads as first-class objects with tracked state.** Continuity is associative, not
  threaded; threads are shapes a reader perceives, not records the system advances. (A rollup is
  the permitted opposite: consulted, not advanced — a map the agent reads, never a plan it
  executes.)
- **No audience or engagement tracking.** The narrator broadcasts into the dark by design; do
  not build it a relationship to optimise.
- **No simulated human-fallible memory.** The record is perfect; the only "forgetting" is the
  deliberate narrowing of what gets foregrounded, which is retrieval, not loss.
- **No echo chamber.** The admired-voices list is for sharpening, not agreement; it is always
  balanced by the opposing and the unaffiliated, and the narrator stays free to disagree with
  anyone on it. Fact-sources are trusted for accuracy, not for taking the narrator's side. A
  foundation that only confirms is a worse thinness than no research at all.
- **No grievance engine.** The frontier of attention grows on recognised pattern and power on
  the ground, never on offence or on what is loudest in the feed; the steelman gate on promotion
  is mandatory, not advisory. A list that only grows, or grows on feeling, is the radicalisation
  failure mode.

## Left for the technical specification

These are yours to resolve and specify, in the Cloudflare-and-Ansible environment you know. Each
is both a decision the technical specification must settle and an artifact it must define:

- The concrete store — vector index and durable object/record storage — and how it *extends*
  the existing Ansible schema rather than duplicating it.
- The bridge's exact shape, and whether to lean on the harness's native persistent-memory
  feature for any lightweight agent-internal state. Read that feature's documentation before
  deciding; the corpus of record, regardless, stays in Cloudflare and outlives the harness.
- Cloud sandbox versus self-hosted execution — self-hosting can sit nearer the data if you
  prefer.
- Embedding provider, dimensions, and re-embedding cadence; index maintenance.
- Where the lists live and how they are edited, and which feeds or sources the scheduled
  reading pulls from for the admired voices.
- How candidates are stored and what thresholds govern promotion, demotion, and pruning on the
  frontier, and where its change-record lives.
- Cost is not a constraint at this scale. Design for clarity, not thrift.
