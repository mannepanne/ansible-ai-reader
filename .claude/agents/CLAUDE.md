# Agent Definitions

This directory contains reusable agent definitions for skills and workflows.

## Purpose

Agents define personas, roles, and behaviors that can be spawned by skills. Separating agent definitions from skill workflows enables:

- **Reusability** - Same agent used by multiple skills
- **Consistency** - Update reviewer behavior once
- **Maintainability** - Evolve agents independently from workflows
- **Clarity** - Skills focus on orchestration, agents focus on execution

## Available Agents

### Code Review Agents (PR reviews)

- **[triage-reviewer.md](./triage-reviewer.md)** - Lightweight risk classifier: decides whether a PR needs light, standard, or team review
- **[light-reviewer.md](./light-reviewer.md)** - Narrow-scope sanity check for low-risk PRs (docs, tests, styling, comment-only changes)
- **[code-reviewer.md](./code-reviewer.md)** - Full-stack developer for comprehensive PR reviews
- **[security-specialist.md](./security-specialist.md)** - Security-focused reviewer for vulnerabilities and threats
- **[product-reviewer.md](./product-reviewer.md)** - Product manager perspective on UX and requirements
- **[architect-reviewer.md](./architect-reviewer.md)** - Senior architect for design patterns and scalability
- **[technical-writer.md](./technical-writer.md)** - Documentation reviewer: REFERENCE/ docs, ABOUT comments, temporal language

### Spec Review Agents (pre-implementation)

- **[requirements-auditor.md](./requirements-auditor.md)** - Completeness: edge cases, error states, missing flows, unstated assumptions
- **[technical-skeptic.md](./technical-skeptic.md)** - Feasibility: DB implications, blast radius, hidden complexity, integration risks
- **[devils-advocate.md](./devils-advocate.md)** - Strategy: is this the right solution? Simpler alternatives? Wrong assumptions?

## Agent-to-skill mapping

| Agent | Used by |
|-------|---------|
| `triage-reviewer` | `/review-pr` (triage step — classifies tier) |
| `light-reviewer` | `/review-pr` (light tier — narrow-scope sanity check) |
| `code-reviewer` | `/review-pr` (standard tier — default prompt) |
| `technical-writer` | `/review-pr` (light tier, standard tier), `/review-pr-team` (team member) |
| `security-specialist` | `/review-pr-team` |
| `product-reviewer` | `/review-pr-team` |
| `architect-reviewer` | `/review-pr-team` |
| `requirements-auditor` | `/review-spec` |
| `technical-skeptic` | `/review-spec` |
| `devils-advocate` | `/review-spec` |

## Usage Pattern

Agent files use YAML frontmatter to register as named sub-agents. Skills invoke them by name — the agent's body is its system prompt, so there's no need to "read the file".

**Agent file (frontmatter + system prompt):**
```markdown
---
name: code-reviewer
description: What this agent does and when to use it
tools: Bash, Read, Glob, Grep
model: sonnet
---

You are a [role]. Your focus: [domain]. Review by checking: [checklist]...
```

**Skill file (orchestration):**
```markdown
Spawn the `code-reviewer` subagent with task: "Review PR #$ARGUMENTS..."
```

## Common Patterns

All reviewer agents share:
- **Context gathering protocol** - How to fetch PR details, read CLAUDE.md, discover specs
- **Completion requirements verification** - Must check tests, documentation, code quality
- **Output format standards** - Consistent structure across all reviews

## When to Create New Agents

Create a new agent when:
- Agent will be used by 2+ skills
- Instructions are substantial (50+ lines)
- Role/persona is distinct and reusable
- You want to version/evolve the agent independently

Keep embedded in skill when:
- Single-use, skill-specific instructions
- Very short instructions (<20 lines)
- Tight coupling between agent and workflow
