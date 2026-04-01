# Reference Documentation
REFERENCE

How-it-works documentation for the Ansible AI Reader system. Auto-loaded when working with files in this directory.

## Finding What You Need

Documentation is organized by **function**, not build chronology. Navigate by **what you're trying to do**:

### 📐 Understanding the System
**[architecture/](./architecture/CLAUDE.md)** - System design, infrastructure, tech stack
- How does it work? What's the tech stack? Why 3 workers?

### ✨ Working with Features
**[features/](./features/CLAUDE.md)** - User-facing feature documentation
- How does Reader sync work? How are AI summaries generated?

### 🚀 Deploying & Operating
**[operations/](./operations/CLAUDE.md)** - Deployment, monitoring, troubleshooting
- How do I deploy? Where are the logs? Something broke!

### 💻 Contributing Code
**[development/](./development/CLAUDE.md)** - Dev workflow, testing, code quality
- How do I run tests? What are the conventions?

### 🏗️ Learning Patterns
**[patterns/](./patterns/CLAUDE.md)** - Best practices, architectural decisions
- Why do we do it this way? How should I implement similar functionality?

### 🗂️ Architecture Decisions
**[decisions/](./decisions/CLAUDE.md)** - Permanent log of significant technical choices and trade-offs
- Why was this built this way? What alternatives were considered?

## Quick Links

### Most Common Needs
- **Deploy to production** → [operations/deployment.md](./operations/deployment.md)
- **Run tests** → [development/testing-strategy.md](./development/testing-strategy.md)
- **Set up environment** → [operations/environment-setup.md](./operations/environment-setup.md)
- **Fix something** → [operations/troubleshooting.md](./operations/troubleshooting.md)
- **Understand architecture** → [architecture/overview.md](./architecture/overview.md)

### Feature-Specific
- **Reader sync** → [features/reader-sync.md](./features/reader-sync.md)
- **AI summaries** → [features/ai-summaries.md](./features/ai-summaries.md)
- **Automated sync** → [features/automated-sync.md](./features/automated-sync.md)
- **User settings** → [features/settings.md](./features/settings.md)

### Patterns & Best Practices
- **Service role client (RLS bypass)** → [patterns/service-role-client.md](./patterns/service-role-client.md)
- **API validation** → [patterns/api-validation.md](./patterns/api-validation.md)
- **Queue processing** → [patterns/queue-processing.md](./patterns/queue-processing.md)
- **Reviewing pull requests** → [development/pr-review-workflow.md](./development/pr-review-workflow.md)

## Standalone Documentation

Some docs don't fit cleanly in a category but are important:

- **[technical-debt.md](./technical-debt.md)** - Known issues and accepted risks
- **[development/pr-review-workflow.md](./development/pr-review-workflow.md)** - Using `/review-pr` and `/review-pr-team`
- **[documentation-refactor-plan.md](./documentation-refactor-plan.md)** - Refactor plan and implementation status

## Navigation Tips

1. **Start with the section index** - Each subdirectory has a CLAUDE.md that lists all docs
2. **Use breadcrumbs** - Every doc shows its location (e.g., "REFERENCE > Features > Reader Sync")
3. **Follow related links** - Docs link to related information at the bottom
4. **Search by question** - "How do I X?" → Find X in the indexes

## Historical Documentation

Phase-based implementation docs are being moved to `SPECIFICATIONS/ARCHIVE/implementation/` as they're replaced by functional documentation above. These remain for historical reference but are not the primary documentation source.
