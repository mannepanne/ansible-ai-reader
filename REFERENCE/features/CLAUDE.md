# Features Documentation
REFERENCE > Features

How-it-works documentation for user-facing features.

## When to Read This
- Understanding how a specific feature works
- Debugging feature behavior
- Extending an existing feature
- Planning feature changes

## Feature Documentation

### Reader Integration
- **[reader-sync.md](./reader-sync.md)** - Fetching and syncing articles from Readwise Reader (API client, rate limiting, pagination)

### AI Features
- **[ai-summaries.md](./ai-summaries.md)** - Perplexity API integration, content truncation (30k limit), token tracking
- **[tags.md](./tags.md)** - AI-generated tags (3-10 per item) and regeneration

### Automation
- **[automated-sync.md](./automated-sync.md)** - Scheduled syncing system (cron worker, intervals, user settings)

### User Preferences & Annotations
- **[settings.md](./settings.md)** - User settings API and UI (sync intervals 0-24h, custom summary prompts)
- **[document-notes.md](./document-notes.md)** - Personal note-taking system that syncs to Readwise Reader
- **[ratings.md](./ratings.md)** - Binary rating system (Interesting/Not interesting) with optimistic UI updates

## Common Questions
- **"How does Reader sync work?"** → [reader-sync.md](./reader-sync.md)
- **"How are AI summaries generated?"** → [ai-summaries.md](./ai-summaries.md)
- **"How does automated sync work?"** → [automated-sync.md](./automated-sync.md)
- **"How do users configure settings?"** → [settings.md](./settings.md)
- **"How are tags generated?"** → [tags.md](./tags.md)
- **"How do document notes work?"** → [document-notes.md](./document-notes.md)
- **"How does the rating system work?"** → [ratings.md](./ratings.md)

## Related Documentation
- [Architecture Overview](../architecture/overview.md) - System design
- [API Design](../architecture/api-design.md) - REST conventions
- [Patterns](../patterns/CLAUDE.md) - Implementation patterns
- [Development](../development/CLAUDE.md) - Contributing code
