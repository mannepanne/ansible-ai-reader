> **Note:** This is an illustrative example ADR. The content (Next.js references, tsconfig.json, etc.) is fictional and project-specific — it exists to demonstrate format and depth, not to reflect this project's actual decisions.

# ADR: Use TypeScript for All New Code

**Date:** 2026-03-15
**Status:** Active
**Supersedes:** N/A

---

## Decision

All new code in this project will be written in TypeScript, not JavaScript.

## Context

We're starting a new web application project. The team needs to decide between JavaScript and TypeScript for the codebase. Previous projects had runtime bugs that TypeScript's type system would have caught during development.

## Alternatives considered

- **JavaScript (ES2022+):** Modern JavaScript with latest features
  - Why not: No compile-time type checking, more runtime errors

- **JavaScript with JSDoc types:** Type hints in comments
  - Why not: Types not enforced, easy to get out of sync, limited type system

- **TypeScript:** Strongly-typed superset of JavaScript
  - **Chosen:** Provides compile-time type safety, better IDE support, catches bugs early

## Reasoning

**Type safety reduces runtime errors:**
- Catches type mismatches during development, not production
- Prevents common bugs (undefined is not a function, cannot read property of null)
- Makes refactoring safer (compiler tells you what breaks)

**Better developer experience:**
- IDE autocomplete for APIs and function signatures
- Inline documentation via type definitions
- Easier to understand code intent (types are documentation)

**Project-specific factors:**
- This is a new project (no legacy JavaScript to maintain)
- Team familiar with TypeScript from previous work
- Build tooling (Next.js) has excellent TypeScript support
- Dependencies we're using have good TypeScript definitions

## Trade-offs accepted

**Compile step required:**
- Must transpile TypeScript → JavaScript
- Slightly slower development feedback loop
- Accepted: Modern tooling makes this negligible (fast incremental builds)

**Learning curve:**
- Team members less familiar with TypeScript need to learn
- Type definitions can be complex for advanced patterns
- Accepted: Investment pays off quickly in reduced bugs and better IDE support

**More verbose:**
- Type annotations add lines of code
- Sometimes need to explicitly type things the compiler can't infer
- Accepted: Verbosity aids clarity and catches errors

**Type definition maintenance:**
- Must keep types up to date as code changes
- Third-party libraries sometimes have incomplete or wrong types
- Accepted: Compiler enforces keeping types current, community types usually good

## Implications

**Enables:**
- Refactoring with confidence (compiler validates changes)
- Better code reviews (types document intent)
- Earlier bug detection (development vs production)
- Improved onboarding (types help new developers understand APIs)

**Prevents/complicates:**
- Cannot use plain .js files without types (must add .d.ts or convert)
- Some dynamic JavaScript patterns harder to type
- Must maintain tsconfig.json and type configuration

---

## References

- [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Next.js TypeScript documentation](https://nextjs.org/docs/basic-features/typescript)
- Project configuration: `tsconfig.json`
