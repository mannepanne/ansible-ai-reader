# Testing Strategy

**When to read this:** Writing tests, setting up test coverage, or implementing TDD workflow.

**Related Documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [CLAUDE.md](./../.claude/CLAUDE.md) - Collaboration principles (testing section)
- [pr-review-workflow.md](./pr-review-workflow.md) - PR review process

---

## Philosophy: Tests as Development Guardrails

**Inspired by:** [OpenAI's Harness Engineering](https://openai.com/index/harness-engineering/) approach to agent-driven development.

Tests in this project serve dual purposes:

1. **Validation** - Verify code works correctly (traditional testing)
2. **Directional Context** - Guide AI agents on what to build and how to build it

When making changes, tests should:
- Immediately signal if changes break existing functionality
- Provide clear context about what each component should do
- Act as executable specifications
- Make it obvious when a change is going in the wrong direction

---

## Testing Principles

### 1. Tests Define Expected Behavior

Tests are **living specifications**. Before writing implementation:
- Define what should happen in the happy path
- Define what should happen when things go wrong
- Specify constraints and validations

### 2. High Coverage Goal

Target: 95%+ lines/functions/statements, 90%+ branches

Why high coverage?
- Agents need clear examples of how code should behave
- Untested code is unclear about its purpose
- Coverage gaps indicate missing specifications

### 3. Tests Fail Fast with Clear Messages

When tests fail, error messages should explain:
- **What** was expected
- **What** actually happened
- **Where** to look (file:line references)
- **Why** it might have failed

### 4. Test Organization Mirrors Code Structure

```
src/
  utils/format.ts
  api/reader.ts

tests/
  utils/format.test.ts
  api/reader.test.ts
```

Easy to find relevant tests when modifying code.

### 5. Tests Are Self-Contained

Each test should:
- Set up its own fixtures and data
- Clean up after itself
- Not depend on other tests
- Be runnable in isolation

---

## Testing Framework

**Test Runner:** [Vitest](https://vitest.dev/)
- Fast, modern, TypeScript-first
- Great DX with watch mode and coverage
- Works well with Next.js and Cloudflare Workers
- Supports ES modules natively

**Mocking:** Vitest built-in mocking + custom mocks for external services

**Coverage:** Vitest with v8 coverage provider

### Setup
```bash
npm install -D vitest @vitest/coverage-v8
```

Configuration in `vitest.config.ts`

---

## Test Categories

### 1. Unit Tests

Test individual functions and utilities in isolation.

**Example scope:**
- Date formatting utilities
- Input validation functions
- String manipulation (slug generation)
- Data transformations

**Example:**
```typescript
// tests/utils/slugGeneration.test.ts
import { describe, it, expect } from 'vitest';
import { generateSlug } from '@/utils/slugGeneration';

describe('generateSlug', () => {
  it('converts title to lowercase with hyphens', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world');
  });
});
```

### 2. Integration Tests

Test how components work together.

**Example scope:**
- API route handlers with mocked external services
- Database operations with test database
- Authentication flow with mocked email service
- Summary generation with mocked Perplexity API

**Example:**
```typescript
// tests/api/reader.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchUnreadItems } from '@/api/reader';

describe('fetchUnreadItems', () => {
  it('fetches items from Reader API', async () => {
    // Mock Reader API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [...] })
    });

    const items = await fetchUnreadItems('test-token');
    expect(items).toHaveLength(5);
  });
});
```

### 3. End-to-End Tests

Test complete user workflows.

**Example scope:**
- User can log in via magic link
- User can sync Reader and view summaries
- User can rate and archive items
- Archived items sync back to Reader

---

## Test-Driven Development Workflow

### For New Features
1. **Write failing tests first** - Define expected behavior
2. **Implement minimum code** - Make tests pass
3. **Refactor** - Improve code while keeping tests green
4. **Verify coverage** - Ensure new code is well-tested

### For Bug Fixes
1. **Write failing test** - Reproduce the bug
2. **Fix the bug** - Make test pass
3. **Add edge case tests** - Prevent regression

### For Refactoring
1. **Verify existing tests pass** - Baseline
2. **Refactor code** - Change implementation
3. **Tests still pass** - Behavior unchanged
4. **Coverage maintained** - No gaps introduced

---

## Mocking Strategy

### What to Mock

**External Services:**
- Readwise Reader API
- Perplexity API
- Supabase (use in-memory for tests or test database)
- Resend email service

### What NOT to Mock

**Core Logic:**
- Business logic and calculations
- Input validation
- Data transformations
- Utility functions

Mocking core logic defeats the purpose of testing.

### Mock Implementations

Create reusable mocks in `tests/mocks/`:

```typescript
// tests/mocks/reader.ts
export function createMockReaderAPI() {
  return {
    fetchUnread: vi.fn(async () => ({ results: [] })),
    archiveItem: vi.fn(async () => ({ success: true }))
  };
}
```

---

## Coverage Requirements

**Overall Target:** 95%+ statements/functions/lines, 90%+ branches

**Per-File Requirements:**
- Utils: 95%+ all metrics
- API clients: 90%+ all metrics
- UI components: 85%+ all metrics

**Allowed Exceptions:**
- Type definition files (no executable code)
- Configuration files
- Explicitly marked `/* istanbul ignore */` with explanation

### Coverage Reporting

```bash
npm run test:coverage
```

Outputs:
- Terminal summary
- HTML report in `coverage/index.html`

---

## CI/CD Integration

### Pre-Commit
```bash
npm test           # All tests must pass
npx tsc --noEmit   # Type check must pass
```

### Pull Request Checks
1. All tests pass
2. Coverage maintained or improved
3. TypeScript compiles
4. Linting passes

---

## Test Documentation Standards

### Test Naming

Use clear, descriptive names that read like specifications:

**Good:**
```typescript
it('generates unique slug by appending -2 when duplicate exists')
it('returns 401 when user is not authenticated')
it('sanitizes user input to prevent XSS')
```

**Bad:**
```typescript
it('works')
it('test slug')
it('returns error')
```

### Test Organization

Group related tests with `describe` blocks:

```typescript
describe('Summary Generation', () => {
  describe('short summaries', () => {
    it('generates bullet points under 2000 chars');
    it('includes 3-5 relevant tags');
  });

  describe('error handling', () => {
    it('retries on API timeout');
    it('falls back gracefully on API error');
  });
});
```

---

## When Tests Are Not Enough

Tests validate **correctness**, but don't guarantee:
- Good UX (need manual testing)
- Performance at scale (need load testing)
- Security against novel attacks (need security review)

**Complement tests with:**
- Manual testing on real devices/browsers
- Security reviews for auth and data handling
- Performance profiling for large datasets

---

**Status:** Template ready - will be updated with actual test patterns as features are implemented
