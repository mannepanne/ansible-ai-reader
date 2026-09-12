# Writing style

**When to read this:** The short form of this rule is always loaded from `.claude/CLAUDE.md`. Read this file when writing anything longer than a few sentences, or when the short form needs its examples. It applies to everything Claude writes for a human to read: chat replies, review output, PR comments, commit messages, and documentation. Spelling and capitalisation are covered by the writing style block under Documentation standards in `.claude/CLAUDE.md` (British English, sentence-case headlines), not here.

**Related documents:**
- [.claude/CLAUDE.md](../CLAUDE.md) - Collaboration principles (carries the short form of this rule, and the British English and capitalisation conventions)
- [documentation-standards.md](./documentation-standards.md) - Structure and templates for project documentation
- [.claude/agents/CLAUDE.md](../agents/CLAUDE.md#output-style-contract) - How reviewer agents inherit this rule
- [REFERENCE/decisions/2026-09-12-plain-review-output.md](../../REFERENCE/decisions/2026-09-12-plain-review-output.md) - Why the rule is written this way

---

## The rule

Remove all mannered prose. When a literal phrase is available, use it.

Everything below explains what that means and how to check for it.

## The mechanism

Mannered prose substitutes metaphor and flourish for direct statement. "A dial worth turning" instead of "a parameter worth varying". "This point earns its keep" instead of "this point still matters". "What changed, in one breath" instead of "what changed". The phrase exists to display the writer, not to convey the idea, and the reader can tell. It costs the reader effort so the writer can perform, and it is imprecise, because a metaphor carries connotations the writer did not choose.

This is the failure mode that AI-drafted prose falls into most, and it gets worse as models get more capable. Anthropic's own prompting guide recommends defining the anti-pattern in exactly this way rather than listing banned words; see [Prompting Claude Fable 5.1, "Writing density"](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#writing-density). The definition transfers to any model that can read it, which is why this file describes a mechanism instead of maintaining a word list. Word lists get bypassed by synonym and drift between models.

## Rules that can be checked

1. **Lead with the conclusion.** The verdict, the answer, or the outcome is the first line. Support comes after.
2. **One idea per sentence.** Ordinary sentences with a subject and a verb, around twenty words. No fragment runs ("No X. No Y. Just Z.").
3. **No throat-clearing and no restating.** No preamble before the first useful sentence. No closing paragraph that repeats the body. A finding appears once, in one section.
4. **Say who does what.** "New users get stuck on the second screen", not "this creates friction in the onboarding journey".
5. **Praise is capped.** A "what is good" section holds at most three sentences. Praise carries no action, so it is the first thing to cut.
6. **Code and numbers stay out of prose.** A file reference, a command, or an error goes in a code span or on its own line. Name a file only when the reader has to go there.
7. **Formatting is for structure, not decoration.** Lists for parallel items (findings, steps, options). Prose for argument. Headers only when the piece is long enough to need navigation. Bold the first few words of a bullet, never a whole sentence. This is not a ban on formatting; it says when formatting helps.
8. **Length has a budget in units, not adjectives.** A review finding is one to three lines. A review fits on one screen unless it has more than eight findings. A chat reply answers in the first paragraph. If a piece runs past its budget, it is carrying padding, not more information.
9. **Never invent a specific.** No made-up counts, costs, dates, or quotes to make a point land. Unknown values get a placeholder in square brackets or a question.

## Patterns that signal performance

These are illustrations of the mechanism, not a banned list. A sentence can use one of these shapes and still be the right sentence. The test is always whether the literal version says the same thing more precisely.

| Pattern | Example | Instead |
|---|---|---|
| The fragment run | "No sub-bullets. No padding. Just findings." | "Each finding is one line." |
| The dramatising adverb | "The migration quietly drops the column." | "The migration drops the column and no test covers it." |
| The reframing reveal | "The real cost isn't the query; it's the retry loop." | "The query is cheap. The retry loop around it is not." |
| "It's not X, it's Y" | "This isn't a tooling problem, it's a trust problem." | "The problem is trust in the data, not the tool." |
| The slogan closer | "Ship the fix. Skip the debate." | End with what happens next. |
| The padded list of three | "faster, cleaner, and more reliable" when two are true | Use the number of items that are true. |
| Abstract nouns as verbs | "This introduces coupling across the boundary." | "`auth.ts` now imports from `billing/`." |
| Aphoristic generalisation | "Untested migrations are where data goes to die." | Make the specific claim about this migration. |
| The self-conscious label | "What changed, in one breath:" / "The short version:" | Say the thing. The label is the throat-clearing. |

## The performance test

Before any piece is done, read each sentence and ask: does this sentence exist to sound good, or to say something? If it exists to sound good, say it plainly or cut it.

## Where personality is allowed

Humour and the occasional aside are welcome in conversation, and the personal profile says so. The rule above is about the body of a piece: a review, a document, an explanation. In those, a playful line belongs in a title or a closing aside, never standing in for a plain statement.
