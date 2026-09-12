# ADR: Review output is budgeted in lines, and the style rule defines a failure mode rather than banning words

**Date:** 2026-09-12
**Status:** Active
**Supersedes:** N/A

---

## Decision

Review output from `/review-spec`, `/review-pr` and `/review-pr-team` is verdict-first, one to three lines per finding, praise capped at three sentences, with no per-reviewer count block. The writing rule behind it lives in one file, [`.claude/COLLABORATION/writing-style.md`](../../.claude/COLLABORATION/writing-style.md), and defines mannered prose as a mechanism with examples instead of maintaining a list of banned words.

## Context

Review output had grown to four screens of prose per run. The operator could not take it in, and the useful facts were buried among restatements. Three causes, all in the template rather than in any one model:

- The synthesis templates asked for a title plus three or four sub-bullets per finding, so ten findings produced forty mandatory sentences before any prose.
- Three sections existed only to restate: "well-specified areas" or "strengths", and a review summary block of per-reviewer tallies.
- The only style instruction anywhere was one line saying "be succinct". An adjective loses to a template that demands four sub-bullets.

A second problem arrived with more capable models: mannered prose. Phrases such as "what changed from the first draft, in one breath" perform for the reader rather than inform them. Anthropic's [prompting guide for Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#writing-density) names this and recommends defining the anti-pattern in the prompt. The template is used across model generations and, in derivative projects, possibly across vendors, so the fix could not be specific to one model.

## Alternatives considered

- **Strengthen the one-line "be succinct" instruction:** cheapest change. Why not: adjectives do not constrain output when a template asks for more. It was already there and had no effect.
- **A separate tone-of-voice skill:** the operator maintains one at work. Why not: skills load on demand. A global style rule needs to be in always-loaded context, and a skill would not be active while the review skills run.
- **A banned-word list:** the common approach. Why not: bypassed by synonym, drifts between models, and needs maintenance every time a new phrase appears. Defining the mechanism ("substitutes metaphor and flourish for direct statement") transfers to any model that can read it.
- **Anti-formatting rules ("never use bullets or bold"):** written to hold down older models that over-formatted. Why not: the same guide reports that newer models under-format when given these rules. A rule that says when formatting helps is neutral in both directions.
- **Chosen: rewrite the templates and add one shared style file, with the essentials repeated inline wherever they are needed.** The templates are the strongest lever because every model fills a template. The style file is the single source of truth. The inline repetitions in `.claude/CLAUDE.md` and the agent contract exist because a pointer alone gets skipped.

## Reasoning

**Templates set the length; instructions cannot override them.** A finding that the template shapes as one line stays one line. The old template shaped it as a block. Changing the template removes the cause instead of asking the model to resist it.

**Budgets in units survive model changes.** "One to three lines per finding" and "one screen unless more than eight findings" mean the same thing to every model. "Concise" does not.

**Praise carries no action.** A review exists to change what happens next. Three sentences is enough to say the work is sound; more than that is the first thing the reader skips.

**The count block restated the bullets.** Per-reviewer tallies and corroboration counts were derived from the findings the reader had just read. Attribution tags on each finding line carry the same information at no cost.

**Repeating the essentials inline is deliberate.** The template's convention is single source of truth plus pointers. Here the core rule also appears in `.claude/CLAUDE.md` and in the agents' shared contract, because a style rule that lives only behind a link is not in context when the writing happens.

## Trade-offs accepted

**Less room for nuance per finding.** A finding with a long chain of reasoning has to compress to three lines. Accepted: the reasoning belongs in the reviewer's report, which the orchestrator has read; the human needs the conclusion, the evidence, and the fix.

**Attribution is lighter.** Reviewer tags replace "raised by" sub-bullets. Accepted: the tag carries the same fact.

**The rule is repeated in many places.** The prose rule lives in three: the style file, `.claude/CLAUDE.md`, and the agents' shared contract. The length budget's numbers are repeated further: in every agent's pointer line and Output Format, in the three skills, and in the workflow reference, which is more than fifteen files. A future change to "one to three lines" touches all of them. Accepted: each copy is one sentence, the full reference is in one file, and a grep for the phrase finds every copy.

## Implications

**Enables:** reviews that fit on one screen; a style rule that any harness or model can apply; a migration packet that derivative projects can take without depending on a specific model.

**Prevents:** the per-reviewer summary block and the praise sections in their old form. A derivative project that wants tallies back should add them to its own copy of the template, not to the shared contract.

---

## References

- Related ADRs: [`2026-07-09-fan-out-review-synthesis.md`](./2026-07-09-fan-out-review-synthesis.md) (the synthesis step this output format belongs to)
- External resources: [Prompting Claude Fable 5.1, "Writing density" and "Formatting in chat"](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#writing-density)
- Style reference: [`.claude/COLLABORATION/writing-style.md`](../../.claude/COLLABORATION/writing-style.md)
- Agent contract: [`.claude/agents/CLAUDE.md`](../../.claude/agents/CLAUDE.md#output-style-contract)
