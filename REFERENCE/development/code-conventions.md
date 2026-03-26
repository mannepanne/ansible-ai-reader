# Code Conventions
REFERENCE > Development > Code Conventions

Coding standards, file structure, and naming conventions for the Ansible AI Reader project.

## When to Read This
- Writing new code
- Reviewing code
- Understanding project style
- Contributing to the project
- Setting up editor configuration

## Related Documentation
- [Testing Strategy](./testing-strategy.md) - Test conventions
- [PR Review Workflow](./pr-review-workflow.md) - Code review process
- [Local Development](./local-development.md) - Development setup
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) - Collaboration principles

---

## Core Principles

### Keep It Simple
- Prefer simple, clean, maintainable solutions over clever ones
- Follow the KISS principle (Keep It Simple, Stupid)
- Avoid over-engineering when a simple solution is available
- Don't rewrite working code without good reason

### Don't Add What's Not Needed
- Follow the YAGNI principle (You Aren't Gonna Need It)
- Only build what is explicitly required
- Don't add features, refactoring, or "improvements" beyond what was asked
- Design with flexibility in mind, but don't implement it until needed

### Stay Focused
- Only make code changes directly related to your current task
- Don't fix unrelated issues in the same PR
- Document unrelated issues as new tasks instead of fixing them immediately

---

## File Headers

All code files should start with `// ABOUT:` comments explaining the file's purpose:

```typescript
// ABOUT: Brief description of file purpose
// ABOUT: Key functionality or responsibility
```

**Good examples:**
```typescript
// ABOUT: Reader API client for fetching and archiving articles
// ABOUT: Handles rate limiting, pagination, and error handling

// ABOUT: Supabase client factory for browser, server, and service role contexts
// ABOUT: Implements service role client pattern for RLS bypass

// ABOUT: Queue consumer worker for processing summary generation jobs
// ABOUT: Fetches full content from Reader and generates AI summaries via Perplexity
```

**Bad examples:**
```typescript
// ABOUT: API stuff

// ABOUT: New implementation (avoid temporal references)

// ABOUT: Helper functions (too vague)
```

---

## Naming Conventions

### Variables and Functions

**Use descriptive names:**
```typescript
// Good
const AUTH_KV = 'auth_cache';
const maxRetryAttempts = 3;
function createServiceRoleClient() { }

// Bad
const KV1 = 'auth_cache';
const max = 3;
function create() { }
```

**Follow TypeScript conventions:**
- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, and classes
- `UPPER_SNAKE_CASE` for constants

**Avoid temporal references:**
```typescript
// Bad - temporal references
const newUserSchema = z.object({...});
const improvedFetchReader = async () => {};
const oldAuthClient = createClient();

// Good - evergreen names
const userSchema = z.object({...});
const fetchReaderItems = async () => {};
const authClient = createClient();
```

### Files and Directories

**Component files:**
- `PascalCase.tsx` for React components: `ReaderItemCard.tsx`
- `camelCase.ts` for utilities: `formatDate.ts`
- `kebab-case` for route directories: `api/reader-sync/`

**Test files:**
- Match source file with `.test.ts` suffix
- Example: `format.ts` → `format.test.ts`

---

## Comments

### Evergreen Comments

Comments should describe what code does, not recent changes or refactors:

```typescript
// Bad - temporal context
// New implementation that fixes the bug from last week
// Refactored from old approach
// Improved version

// Good - evergreen
// Fetches unread items with automatic pagination
// Bypasses RLS for trusted server operations
// Retries up to 3 times with exponential backoff
```

### Minimal Comments

Code should be self-documenting through clear names and structure:

```typescript
// Bad - unnecessary comments
// Loop through items
for (const item of items) {
  // Archive each item
  await archiveItem(item);
}

// Good - self-documenting
for (const item of items) {
  await archiveItem(item);
}
```

### When to Comment

**Do comment:**
- Complex algorithms or logic
- Non-obvious decisions and tradeoffs
- Security-critical sections
- Workarounds for external API quirks
- Performance optimizations

**Example:**
```typescript
// Truncate content at 30k chars to stay within Perplexity's token limit
// Context window: ~4096 tokens ≈ 30,000 characters
const MAX_CONTENT_LENGTH = 30000;
if (content.length > MAX_CONTENT_LENGTH) {
  content = content.substring(0, MAX_CONTENT_LENGTH);
}

// Service role client bypasses RLS - safe here because we verified
// the session at API level before calling this function
const serviceClient = createServiceRoleClient();
```

---

## Code Style

### TypeScript

**Always use types:**
```typescript
// Good
function fetchItems(userId: string): Promise<ReaderItem[]> {
  return supabase.from('reader_items').select('*').eq('user_id', userId);
}

// Bad - implicit any
function fetchItems(userId) {
  return supabase.from('reader_items').select('*').eq('user_id', userId);
}
```

**Prefer interfaces for objects:**
```typescript
// Good
interface ReaderItem {
  id: string;
  title: string;
  url: string;
  summary?: string;
}

// Also good for unions/utility types
type ItemStatus = 'pending' | 'processing' | 'completed' | 'failed';
```

**Use strict mode:**
- `strictNullChecks: true`
- `noImplicitAny: true`
- Handle null/undefined explicitly

### Error Handling

**Be explicit about errors:**
```typescript
// Good
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reader API error: ${response.status}`);
  }
  return await response.json();
} catch (error) {
  console.error('[Reader] Failed to fetch items:', error);
  throw error; // Re-throw after logging
}

// Bad - silent failures
try {
  const response = await fetch(url);
  return await response.json();
} catch {
  return null; // Swallowed error
}
```

**Validate at boundaries:**
- User input: Always validate
- External APIs: Validate responses
- Internal functions: Trust type system

### Security

**Never commit secrets:**
```typescript
// Bad - secret in code
const API_KEY = 'sk-1234567890abcdef';

// Good - from environment
const API_KEY = process.env.PERPLEXITY_API_KEY;
if (!API_KEY) {
  throw new Error('PERPLEXITY_API_KEY not configured');
}
```

**Sanitize user input:**
```typescript
// Zod validation with sanitization
const schema = z.string()
  .min(10)
  .max(2000)
  .transform(text => text.replace(/<[^>]*>/g, '')) // Strip HTML
  .refine(text => {
    const dangerous = ['ignore previous', 'system:', 'assistant:'];
    return !dangerous.some(phrase => text.toLowerCase().includes(phrase));
  }, 'Prompt injection patterns detected');
```

---

## File Organization

### Imports

**Order imports:**
1. External packages (React, Next.js, etc.)
2. Internal imports (utils, types)
3. Relative imports (./components)

**Example:**
```typescript
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { validateSession } from '@/lib/auth';
import { ReaderItem } from '@/types';

import { fetchReaderItems } from './reader';
```

### Code Structure

**Organize by responsibility:**
```
src/
  app/              # Next.js app directory (routes)
  lib/              # Core utilities and clients
  utils/            # Pure utility functions
  types/            # TypeScript type definitions
  components/       # React components

workers/            # Cloudflare Workers (consumer, cron)
tests/              # Tests (mirrors src/ structure)
```

---

## Consistency Over Perfection

### Match Surrounding Code

When modifying code, match the style and formatting of surrounding code, even if it differs from standard style guides:

```typescript
// If existing code uses this pattern:
const result = await supabase
  .from('items')
  .select('*')
  .eq('id', id)
  .single();

// Match it instead of reformatting:
const result = await supabase.from('items').select('*').eq('id', id).single();
```

**Consistency within a file is more important than strict external standards.**

---

## Code Review Focus

When reviewing code, prioritize:
1. **Correctness** - Does it work? Are there bugs?
2. **Security** - Any vulnerabilities? Secrets exposed?
3. **Testing** - Adequate test coverage?
4. **Clarity** - Is it understandable?
5. **Style** - Follows conventions (but not a blocker)

Style issues are suggestions, not blockers, unless they harm readability.

---

## Tools and Configuration

### TypeScript Config

Target: ESNext for Next.js/Cloudflare Workers runtime
- Strict mode enabled
- Path alias: `@/` maps to `./src/`
- React 19 and Next.js 15 types

### Formatting

No strict formatter enforced (ESLint only). Rely on:
- Consistent code style within files
- Code review feedback
- TypeScript compiler

### Linting

```bash
# Run linting
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

---

## Definition of Done

Code is NOT complete until:
1. ✅ Tests exist and pass (95%+ coverage)
2. ✅ TypeScript compiles without errors
3. ✅ Follows conventions in this guide
4. ✅ No secrets or debug code committed
5. ✅ Documentation updated if needed

---

## Related Documentation

- [Testing Strategy](./testing-strategy.md) - Test conventions and requirements
- [PR Review Workflow](./pr-review-workflow.md) - Code review process
- [Local Development](./local-development.md) - Development setup and workflow
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) - Collaboration principles and rules
