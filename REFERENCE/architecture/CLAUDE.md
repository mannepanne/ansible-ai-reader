# Architecture Documentation
REFERENCE > Architecture

System design, technical architecture, and infrastructure documentation.

## When to Read This
- Understanding how the system works
- Making architectural decisions
- Debugging infrastructure issues
- Planning major changes

## Architecture Documentation

### System Overview
- **[overview.md](./overview.md)** - High-level system architecture, tech stack, worker design (3 core + 2 Relay: bridge + orchestrator)
- **[use-of-managed-agents.md](./use-of-managed-agents.md)** - How the Relay narrator's rented "mind" (Anthropic Managed Agents) connects to owned memory across the bridge seam

### Infrastructure
- **[workers.md](./workers.md)** - Main app worker, queue consumer, cron worker, Relay bridge, Relay orchestrator (Durable Object)
- **[database-schema.md](./database-schema.md)** - Tables, relationships, indexes, RLS policies

### Core Systems
- **[authentication.md](./authentication.md)** - Supabase Auth, magic links, sessions, middleware
- **[api-design.md](./api-design.md)** - REST conventions, error handling, validation patterns

## Common Questions
- **"Why do we have multiple workers?"** → [workers.md](./workers.md)
- **"What's the database schema?"** → [database-schema.md](./database-schema.md)
- **"How does authentication work?"** → [authentication.md](./authentication.md)
- **"What's the tech stack?"** → [overview.md](./overview.md)

## Related Documentation
- [Features](../features/CLAUDE.md) - How user-facing features work
- [Patterns](../patterns/CLAUDE.md) - Implementation patterns
- [Operations](../operations/CLAUDE.md) - Deployment and maintenance
