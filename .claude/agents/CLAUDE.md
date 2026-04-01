# Agent Definitions

This directory contains reusable agent definitions for skills and workflows.

## Purpose

Agents define personas, roles, and behaviors that can be spawned by skills. Separating agent definitions from skill workflows enables:

- **Reusability** - Same agent used by multiple skills
- **Consistency** - Update reviewer behavior once
- **Maintainability** - Evolve agents independently from workflows
- **Clarity** - Skills focus on orchestration, agents focus on execution

## Available Agents

### Code Review Agents

- **[code-reviewer.md](./code-reviewer.md)** - Full-stack developer for comprehensive PR reviews
- **[security-specialist.md](./security-specialist.md)** - Security-focused reviewer for vulnerabilities and threats
- **[product-reviewer.md](./product-reviewer.md)** - Product manager perspective on UX and requirements
- **[architect-reviewer.md](./architect-reviewer.md)** - Senior architect for design patterns and scalability

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
