# Phase [X]: [Phase Name]

**⚠️ TEMPLATE FILE** - This is an example showing what a phase specification should include. Delete or replace this file when creating your actual implementation phases.

---

## Phase overview

**Phase number:** [X]
**Phase name:** [Descriptive name for this implementation phase]
**Estimated timeframe:** [e.g., Week 1-2, 3-5 days, etc.]
**Dependencies:** [e.g., "Requires Phase 1 (Foundation) complete" or "None - starting phase"]

**Brief description:**
[2-3 sentences explaining what this phase accomplishes and why it's important]

---

## Scope and deliverables

### In scope
- [ ] [Specific deliverable 1]
- [ ] [Specific deliverable 2]
- [ ] [Specific deliverable 3]
- [ ] [Tests for all new functionality]
- [ ] [Documentation updates]

### Out of scope
- [Feature or optimisation deferred to later phase]
- [Nice-to-have that's not critical for this phase]
- [Advanced functionality saved for future iteration]

### Acceptance criteria
- [ ] [Specific testable criterion 1]
- [ ] [Specific testable criterion 2]
- [ ] [Specific testable criterion 3]
- [ ] All tests passing with [X]% coverage
- [ ] Type checking passes with no errors
- [ ] Manual testing completed successfully

---

## Technical approach

### Architecture decisions

**[Decision 1: e.g., "Authentication Strategy"]**
- Choice: [What you decided to use]
- Rationale: [Why this choice makes sense]
- Alternatives considered: [What else you looked at]

**[Decision 2: e.g., "Database Schema"]**
- Choice: [What structure you're using]
- Rationale: [Why this works for your use case]
- Alternatives considered: [Other options you evaluated]

### Technology choices

**Framework/Library:** [Name and version]
- Purpose: [What it's used for]
- Documentation: [Link to docs]

**[Additional technologies as needed]**

### Key files and components

**New files to create:**
```
src/
  ├── components/
  │   ├── [ComponentName].tsx
  │   └── [ComponentName].test.tsx
  ├── lib/
  │   ├── [utilityName].ts
  │   └── [utilityName].test.ts
  └── types/
      └── [typeName].ts
```

**Files to modify:**
```
- [existing-file-1.ts] - [what changes and why]
- [existing-file-2.ts] - [what changes and why]
```

### Database schema changes

**New tables:** (if applicable)
```sql
CREATE TABLE [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  [field_name] [TYPE] [CONSTRAINTS],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Schema modifications:** (if applicable)
```sql
ALTER TABLE [existing_table] ADD COLUMN [new_column] [TYPE];
```

**Indexes:**
```sql
CREATE INDEX idx_[table]_[column] ON [table]([column]);
```

---

## Testing strategy

### Unit tests

**Coverage targets:**
- Lines: 95%+
- Functions: 95%+
- Branches: 90%+
- Statements: 95%+

**Key test files:**
- `[ComponentName].test.tsx` - Component behavior and rendering
- `[utilityName].test.ts` - Business logic and edge cases
- `[apiRoute].test.ts` - API endpoint responses and errors

### Integration tests

**Test scenarios:**
- [ ] [End-to-end flow 1]
- [ ] [End-to-end flow 2]
- [ ] [Error handling scenario]
- [ ] [Edge case scenario]

### Manual testing checklist

- [ ] [User action 1] works as expected
- [ ] [User action 2] works as expected
- [ ] Error states display correctly
- [ ] Loading states work properly
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] Accessibility requirements met (keyboard navigation, screen readers)

---

## Pre-commit checklist

Before creating PR, verify:

- [ ] All tests passing (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Manual verification complete (see checklist above)
- [ ] Documentation updated:
  - [ ] Code comments added for complex logic
  - [ ] REFERENCE/ docs updated if needed
  - [ ] Root CLAUDE.md updated if architecture changed
- [ ] No console.log or debug code left in
- [ ] No secrets or sensitive data in code
- [ ] Dependencies properly declared in package.json

---

## PR workflow

### Branch naming
```
feature/phase-[X]-[brief-description]
```

Example: `feature/phase-2-authentication`

### PR title
```
Phase [X]: [Phase Name]
```

### PR description template
```markdown
## Summary
[Brief overview of what this phase implements]

## Changes
- [Key change 1]
- [Key change 2]
- [Key change 3]

## Testing
- [ ] Unit tests: [X]% coverage
- [ ] Integration tests passing
- [ ] Manual testing completed

## Screenshots/Demo
[If applicable, add screenshots or video demo]

## Deployment Notes
[Any special deployment steps or environment variables needed]
```

### Review requirements
- [ ] Use `/review-pr` for standard review
- [ ] Use `/review-pr-team` if this phase involves:
  - Breaking changes
  - Security-sensitive code
  - Complex architectural decisions
  - Database migrations

### Deployment steps
1. [Step 1: e.g., "Run database migrations"]
2. [Step 2: e.g., "Deploy to staging"]
3. [Step 3: e.g., "Verify in staging environment"]
4. [Step 4: e.g., "Deploy to production"]
5. [Step 5: e.g., "Monitor for errors"]

---

## Edge cases and considerations

### Known risks
- **[Risk 1]:** [Description and mitigation strategy]
- **[Risk 2]:** [Description and mitigation strategy]

### Performance considerations
- [Consideration 1: e.g., "API calls are batched to reduce requests"]
- [Consideration 2: e.g., "Images are lazy-loaded for better performance"]

### Security considerations
- [Consideration 1: e.g., "All user input is sanitized"]
- [Consideration 2: e.g., "API endpoints require authentication"]

### Accessibility considerations
- [Consideration 1: e.g., "All interactive elements are keyboard accessible"]
- [Consideration 2: e.g., "ARIA labels added for screen readers"]

### Future optimisation opportunities
- [Optimisation 1: e.g., "Could add caching in Phase 5"]
- [Optimisation 2: e.g., "Batch operations could be parallelized later"]

---

## Technical debt introduced

**[TD-XXX: Brief description]** (if applicable)
- **Location:** `[file path]` - `[function name]`
- **Issue:** [What shortcut or limitation exists]
- **Why accepted:** [Reason for accepting this debt now]
- **Risk:** Low/Medium/High
- **Future fix:** [How to address this later]

See [technical-debt.md](../REFERENCE/technical-debt.md) for full tracker.

---

## Related documentation

- [Root CLAUDE.md](../CLAUDE.md) - Project navigation
- [Master specification](./ORIGINAL_IDEA/project-outline.md) - Original vision
- [Phase [X-1]](./0[X-1]-previous-phase.md) - Previous phase (if applicable)
- [testing-strategy.md](../REFERENCE/testing-strategy.md) - Testing approach
- [environment-setup.md](../REFERENCE/environment-setup.md) - Environment configuration

---

## Notes

[Add any additional context, learnings, or important information discovered during planning]
