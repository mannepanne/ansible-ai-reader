# Architecture Decision Records (ADRs)

Auto-loaded when working with files in this directory. Documents architectural decisions and their reasoning.

---

## What are ADRs?

**Architecture Decision Records** capture the reasoning behind significant technical choices. They prevent re-debating decisions by documenting:

- What was decided
- Why this came up
- What alternatives were considered
- Why this option won
- What trade-offs were accepted

**Key insight:** Written reasoning compounds. Opinions evaporate.

---

## When to create an ADR

**Create an ADR when making decisions that:**
- Affect architecture beyond today's PR
- Choose between meaningful alternatives (library, pattern, API design)
- Involve significant trade-offs
- Decide NOT to do something (equally important)
- Will constrain or enable future work

**Don't create for:**
- Tactical implementation details (belongs in code comments)
- Obvious choices (no alternatives considered)
- Easily reversible decisions
- Preferences without reasoning

**Rule of thumb:** If you spent >15 minutes debating it with reasoning, it probably deserves an ADR.

---

## How it works

### When decision is made

**Claude's role:**
1. Recognize when a decision "outlasts today's PR"
2. Prompt: "This decision affects future architecture. Should I create an ADR in REFERENCE/decisions/?"
3. User confirms or declines
4. If confirmed, Claude creates ADR using template format

**User's role:**
- Confirm when Claude suggests ADR
- Or request ADR explicitly: "Let's document this decision"

### Before making similar decision

**Search precedent first:**
```bash
grep -r "library" REFERENCE/decisions/
grep -r "authentication" REFERENCE/decisions/
```

**Follow existing ADR unless:**
- New information invalidates the reasoning
- Context has changed significantly
- Trade-offs no longer apply

**If superseding:** Create new ADR referencing the old one, mark old as "Superseded"

---

## ADR format

**Filename:** `YYYY-MM-DD-{topic}.md` (chronological + descriptive)

**Example:** `2026-03-29-jwt-authentication.md`

**Template:**
```markdown
# ADR: {What you decided}

**Date:** YYYY-MM-DD
**Status:** Active | Superseded | Deprecated
**Supersedes:** (if applicable)

---

## Decision

[One sentence: what was decided]

## Context

[Why this decision came up. What problem are we solving?]

## Alternatives considered

- **Option A:** [Description] - [Why not this]
- **Option B:** [Description] - [Why not this]
- **Chosen: Option C:** [Description] - [Why this won]

## Reasoning

[Detailed explanation of why this option was chosen]

[Key factors that influenced the decision]

## Trade-offs accepted

[What we gave up by choosing this]

[Limitations or constraints this introduces]

## Implications

[What this enables going forward]

[What this prevents or makes harder]

---

## References

- Related ADRs: (if applicable)
- External resources: (if applicable)
- Relevant specs: (if applicable)
```

---

## ADR Index

**Format:** Listed chronologically (newest first)

*(No ADRs yet - this section will be updated as decisions are recorded)*

---

## Example ADR

See [TEMPLATE-adr.md](./TEMPLATE-adr.md) for a complete example.

---

## Integration with other docs

**ADRs complement:**
- **SPECIFICATIONS/** - Plans reference ADRs for context ("We're doing X because ADR-015")
- **REFERENCE/** - How-it-works docs reference ADRs for "why this way"
- **Code comments** - Link to relevant ADR for architectural choices
- **PR descriptions** - Mention ADR if decision was made during PR work

**ADRs are permanent:**
- Committed to version control
- Survive compaction, crashes, months
- Searchable and linkable
- Build institutional knowledge over time

---

## Best practices

**Writing ADRs:**
- Be specific about alternatives (not "considered other options")
- Explain reasoning clearly (someone reading 6 months later should understand)
- Include trade-offs honestly (every choice has downsides)
- Use British English (project standard)
- Keep concise but complete

**Maintaining ADRs:**
- Never delete (mark as Superseded instead)
- Update index in this CLAUDE.md when adding new ADR
- Link related ADRs together
- Reference from specs/docs where relevant

**Using ADRs:**
- Search before making similar decision
- Follow precedent unless context changed
- Create new ADR if superseding old decision
- Link to ADRs in PR descriptions for context

---

## Credits

Inspired by:
- [Michael Nygard's ADR pattern](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions)
- LinkedIn post about preventing re-debate of settled decisions
- Experience with Claude Code sessions losing decision context
