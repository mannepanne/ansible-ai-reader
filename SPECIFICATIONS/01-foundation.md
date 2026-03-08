# Phase 1: Foundation

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: None
**Estimated Effort**: Week 1-2

---

## Overview

Set up the basic Next.js application structure with Cloudflare Workers deployment, Tailwind CSS styling, and Supabase database. By the end of this phase, we should have a "hello world" deployed to ansible.hultberg.org with database schema in place.

---

## Scope & Deliverables

### Core Tasks
- [ ] Initialize Next.js 14+ project with App Router
- [ ] Configure `@cloudflare/next-on-pages` adapter
- [ ] Set up Tailwind CSS (copy base styles from hultberg.org/updates)
- [ ] Create Supabase project
- [ ] Implement database schema (users, reader_items, sync_log)
- [ ] Configure Row-Level Security (RLS) policies
- [ ] Set up Resend for email delivery
- [ ] Deploy basic "hello world" to ansible.hultberg.org
- [ ] Configure environment variables (local + production)

### Out of Scope
- Authentication implementation (Phase 2)
- Any API integrations (Phases 3-4)
- UI components beyond basic layout

---

## Database Schema

### Table: `users`
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  summary_prompt text
);
```

### Table: `reader_items`
```sql
CREATE TABLE reader_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reader_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  author text,
  source text,
  content_type text,

  short_summary text,
  long_summary text,
  tags text[],
  perplexity_model text,

  document_note text,
  rating integer,
  archived boolean DEFAULT false,
  archived_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  UNIQUE(user_id, reader_id)
);

CREATE INDEX idx_user_archived ON reader_items(user_id, archived, created_at DESC);
CREATE INDEX idx_user_tags ON reader_items USING GIN(tags);
```

### Table: `sync_log`
```sql
CREATE TABLE sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  sync_type text,
  items_fetched integer,
  items_created integer,
  errors jsonb,
  created_at timestamp with time zone DEFAULT now()
);
```

### Row-Level Security (RLS)
```sql
ALTER TABLE reader_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items"
  ON reader_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON reader_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON reader_items FOR UPDATE
  USING (auth.uid() = user_id);
```

Apply similar RLS to `users` and `sync_log` tables.

---

## Testing Strategy

**Philosophy**: Tests provide validation AND directional context for development. See [testing-strategy.md](../REFERENCE/testing-strategy.md) for full details.

### Required Tests

**1. Database Schema Tests**
- [ ] Tables created successfully
- [ ] Indexes exist and are performant
- [ ] RLS policies enforce user isolation
- [ ] Unique constraints work as expected

**2. Deployment Tests**
- [ ] Next.js builds successfully with Cloudflare adapter
- [ ] Build output fits within Workers size limits
- [ ] Basic route renders at ansible.hultberg.org
- [ ] Environment variables accessible in Workers runtime

**3. Integration Tests**
- [ ] Supabase client connects successfully
- [ ] Database queries work from Workers environment
- [ ] Tailwind CSS loads and renders correctly

### Test Commands
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode during development
npm run test:coverage     # Coverage report (target: 95%+ lines/functions/statements)
npx tsc --noEmit          # Type checking (must pass before commit)
```

**Coverage Target**: 100% for new code (enforced minimums: 95% lines/functions/statements, 90% branches)

---

## Pre-Commit Checklist

Before creating a PR for this phase:

- [ ] All tests pass (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Database schema deployed to Supabase
- [ ] RLS policies tested and working
- [ ] Environment variables documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] "Hello world" deployed and accessible at ansible.hultberg.org
- [ ] No secrets committed to repository

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and pre-commit checklist passed.

**PR Title**: `Phase 1: Foundation - Next.js + Cloudflare + Supabase setup`

**PR Description Template**:
```markdown
## Summary
Completes Phase 1: Foundation setup for Ansible project.

## What's Included
- Next.js 14+ with App Router
- Cloudflare Workers adapter configured
- Tailwind CSS setup (base styles from hultberg.org/updates)
- Supabase database with schema and RLS policies
- Resend email configuration
- Deployed to ansible.hultberg.org

## Testing
- [x] All tests pass
- [x] Type checking passes
- [x] Coverage: XX% (target: 95%+)
- [x] Manual testing: deployment accessible

## Environment Variables Required
See [environment-setup.md](../REFERENCE/environment-setup.md) for configuration details.

## Next Steps
Phase 2: Authentication (magic link implementation)
```

**Review Process**: Use `/review-pr` for standard review.

---

## Acceptance Criteria

Phase 1 is complete when:

1. ✅ Next.js app builds and deploys to Cloudflare Workers
2. ✅ ansible.hultberg.org shows a basic "hello world" page
3. ✅ Database schema created in Supabase with RLS enabled
4. ✅ All tests passing with 95%+ coverage
5. ✅ Environment variables documented
6. ✅ No secrets in repository
7. ✅ PR merged to main branch

---

## Technical Considerations

### Cloudflare Workers Constraints
- **Build size**: Monitor bundle size (Workers have size limits)
- **Runtime compatibility**: Test database connections work in Workers environment
- **Cold starts**: Acceptable for MVP, optimize later if needed

### Supabase Configuration
- Use free tier initially (500MB database, 2GB bandwidth)
- Configure connection pooling if needed
- Document backup/restore strategy

### Security
- Store all API keys/secrets in environment variables
- Never commit `.env` files
- Use Cloudflare Workers secrets for production

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Next.js on Pages**: https://github.com/cloudflare/next-on-pages
- **Supabase Docs**: https://supabase.com/docs
