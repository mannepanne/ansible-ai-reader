# Reference Documentation Library

Auto-loaded when working with files in this directory. How-it-works documentation for implemented features.

## Files in This Directory

### [phase-1-completion-summary.md](./phase-1-completion-summary.md)
**When to read:** Understanding what was built in Phase 1 and the overall foundation.

High-level overview of Phase 1 completion: what we built, key metrics, technical learnings, architecture decisions, and next steps. Start here for Phase 1 context.

### Phase 1 Implementation Details

#### [phase-1-1-implementation.md](./phase-1-1-implementation.md)
**When to read:** Understanding the Next.js setup, build process, or testing infrastructure.

Complete documentation of Phase 1.1 implementation: Next.js 15 scaffolding, Cloudflare Workers setup, testing infrastructure, and build commands.

#### [phase-1-2-implementation.md](./phase-1-2-implementation.md)
**When to read:** Understanding the database schema, environment validation, or Supabase client usage.

Complete documentation of Phase 1.2 implementation: Database schema (4 tables), Row-Level Security policies, environment variable validation with Zod, and Supabase client setup.

#### [phase-1-3-1-implementation.md](./phase-1-3-1-implementation.md)
**When to read:** Understanding Cloudflare Workers deployment, environment variable configuration, or production setup.

Complete documentation of Phase 1.3.1 implementation: Cloudflare Workers deployment configuration, environment variable management with Wrangler secrets, build process, and deployment workflow.

#### [phase-1-3-2-implementation.md](./phase-1-3-2-implementation.md)
**When to read:** Understanding Cloudflare Queues setup, queue producer API, or async job processing.

Complete documentation of Phase 1.3.2 implementation: Cloudflare Queues producer infrastructure, getCloudflareContext usage, build-time vs runtime environment handling, and lazy-loading patterns.

### Phase 2 Implementation Details

#### [phase-2-implementation.md](./phase-2-implementation.md)
**When to read:** Understanding authentication flow, Supabase SSR clients, middleware, or session management.

Complete documentation of Phase 2 implementation: Magic link authentication with Supabase Auth + Resend SMTP, three Supabase client patterns (browser, server, middleware), protected route middleware, session refresh, and testing strategy.

### Phase 3 Implementation Details

#### [phase-3-implementation.md](./phase-3-implementation.md)
**When to read:** Understanding Reader API integration, sync operations, queue consumer, or status polling. 🚧 In Progress

Complete documentation of Phase 3 implementation (backend): Reader API client with Zod validation and rate limiting, sync endpoint with pagination support, status polling endpoint, queue consumer worker, database migration (sync_log_id), error handling, and testing strategy. UI implementation pending.

### General Documentation

### [testing-strategy.md](./testing-strategy.md)
**When to read:** Writing tests, setting up test coverage, or implementing TDD workflow.

Complete testing philosophy, framework setup (Vitest), test categories, coverage requirements, and CI/CD integration.

### [technical-debt.md](./technical-debt.md)
**When to read:** Planning refactors, reviewing known issues, or documenting accepted shortcuts.

Tracker for known limitations, accepted risks, and deferred improvements with risk assessments.

### [environment-setup.md](./environment-setup.md)
**When to read:** Setting up local development, configuring secrets, or deploying to production.

Environment variables, API key configuration, third-party service setup (Supabase, Readwise, Perplexity, Resend).

### [troubleshooting.md](./troubleshooting.md)
**When to read:** Debugging issues, fixing deployment problems, or resolving API integration errors.

Common issues and solutions for local development, deployment, and API integrations.

### [pr-review-workflow.md](./pr-review-workflow.md)
**When to read:** Creating PRs or running code reviews.

How to use `/review-pr` and `/review-pr-team` skills for automated code review.
