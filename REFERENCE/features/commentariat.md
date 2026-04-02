# Commentariat
REFERENCE > Features > Commentariat

On-demand intellectual stress-testing of article content via Perplexity API.

## What Is This?

Commentariat is a second AI analysis mode alongside the standard summary. Where the summary tells you *what* an article says, Commentariat tells you *how well it holds up* — surfacing counter-arguments, competing frameworks, dissenting expert perspectives, and significant caveats.

It uses Perplexity's web search to locate substantive intellectual challenges to the core claims, regardless of whether the article itself has generated online discussion.

## Core Workflow

```
1. User clicks "Analyse ideas" on the Commentariat tab of an item card
2. POST /api/reader/commentariat { itemId }
3. Auth + ownership check
4. fetchArticleContent() fetches full article from Reader API
5. generateCommentariat() calls Perplexity with critical-analyst prompt
6. Result stored in reader_items.commentariat_summary + commentariat_generated_at
7. Card updates in-place — no page reload
```

Commentariat is **on-demand only** — not auto-generated during sync. Users trigger it explicitly per item. See architecture decision below.

## Perplexity Integration

### Model: sonar
Same model and rate limiter as summary generation (50 req/min via PQueue).

### System Prompt
```
You are a critical analyst helping an evidence-driven reader evaluate ideas under scrutiny.
Focus on intellectual robustness, not rhetorical style.
```

### User Prompt
```
Analyse the intellectual robustness of the main claims in this content.

Identify:
- Counter-arguments from established research or expert consensus
- Alternative schools of thought or competing frameworks that reach different conclusions
- Significant caveats, blind spots, or nuances the author may have overlooked

Be specific and grounded. Avoid vague hedging. Format as bullet points grouped under short headers.

Title: ${item.title}
Author: ${item.author || 'Unknown'}

Content:
${truncatedContent}
```

### Expected Response Format
```
## Counter-arguments
- ...

## Alternative perspectives
- ...

## Caveats and blind spots
- ...
```

Response is stored as plain text — no tag parsing needed (unlike summary generation).

## API Endpoint

**`POST /api/reader/commentariat`**

Implementation: `src/app/api/reader/commentariat/route.ts`

Request:
```json
{ "itemId": "uuid" }
```

Response:
```json
{ "commentariat": "## Counter-arguments\n- ..." }
```

Error cases:
- `401` — unauthenticated
- `404` — item not found or not owned by user
- `503` — Perplexity API failure (no DB write on failure)

**Regeneration:** Calling the endpoint on an item that already has a commentariat regenerates it unconditionally — the user explicitly requested it.

## Database Schema

```sql
-- Added in migration: 20260402_add_commentariat.sql
ALTER TABLE reader_items
  ADD COLUMN commentariat_summary TEXT,
  ADD COLUMN commentariat_generated_at TIMESTAMPTZ;
```

No index — these are display columns, not query columns.

## UI

### Tab Bar
Every item card has two tabs: **Summary** (default) and **Commentariat**. The controls row (Expand, Add note, ratings) and tags sit outside the tabs and are always visible regardless of which tab is active.

### Commentariat Tab States
- **Before generation:** "Analyse ideas" button centred in the tab area
- **In flight:** Spinner + "Analysing…" (button replaced, ~5–15s typical)
- **After generation:** ReactMarkdown rendering of headers + bullet points, timestamp ("Analysed 2 Apr 2026"), small Refresh icon to regenerate
- **Error:** Inline message "Analysis unavailable — try again"

## Architecture Decision: On-Demand Only

Auto-generation during sync was explicitly deferred.

**Rationale:** Not every article benefits — a short news brief needs no intellectual stress-test. Cost doubles if generated for all items automatically. Latency: stacking Commentariat on top of summary generation would increase queue wait time.

**Extension path:** `generateCommentariat()` (`src/lib/perplexity-api.ts`) is self-contained. Auto-generation would add a `job_type: 'commentariat_generation'` to the queue consumer — no restructuring of the endpoint or UI required.

## Related Documentation
- [AI Summaries](./ai-summaries.md) — Summary generation architecture (shared patterns)
- [Settings](./settings.md) — Custom prompt precedent
- [Workers](../architecture/workers.md) — Queue consumer
- [Issue #22](https://github.com/mannepanne/ansible-ai-reader/issues/22) — Original feature request
