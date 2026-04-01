# Feature: Commentariat — Intellectual Stress-Testing of Content

**Status**: Implemented — In Review (PR #71)
**Last Updated**: 2026-04-01
**Dependencies**: Phase 4 ✅ (Perplexity integration), Phase 5 ✅ (UI card patterns)
**Related Issue**: [#22](https://github.com/mannepanne/ansible-ai-reader/issues/22)

---

## Overview

The existing AI summary tells you *what* an article says. Commentariat tells you *how well it holds up* — surfacing counter-arguments, competing frameworks, dissenting expert perspectives, and significant caveats that the original author may have overlooked or ignored.

This is distinct from "find comments on this article." Perplexity's web search will locate substantive intellectual challenges to the core ideas: academic rebuttals, alternative schools of thought, expert disagreement — regardless of whether the article itself has generated online discussion.

The result: users can evaluate the intellectual robustness of content before deciding whether to engage deeply with it. A natural complement to the depth-of-engagement triage workflow.

---

## What Already Exists

- `generateSummary()` in `src/lib/perplexity-api.ts` — reusable pattern for Perplexity API calls
- `sonar` model integration with rate limiting, content truncation, response parsing
- `reader_items` table with `short_summary`, `perplexity_model`, `content_truncated` columns — established pattern for storing AI-generated content
- Settings custom prompt infrastructure (`summary_prompt`) — extensibility precedent

---

## What Does NOT Exist (and must be built)

- `generateCommentariat()` function in `perplexity-api.ts` — separate from `generateSummary()`
- `POST /api/reader/commentariat` endpoint — on-demand trigger
- `commentariat_summary TEXT` and `commentariat_generated_at TIMESTAMPTZ` columns on `reader_items`
- Tabbed UI on the item card (tabs do not currently exist — tags are shown below the summary as plain text)
- "Analyse ideas" button to trigger on-demand Commentariat generation

---

## Scope

### Part 1: `generateCommentariat()` (`src/lib/perplexity-api.ts`)

New function alongside `generateSummary()`. Shares the same Perplexity client, rate limiter, and content truncation logic. Key differences:

**System message:**
```
You are a critical analyst helping an evidence-driven reader evaluate ideas under scrutiny.
Focus on intellectual robustness, not rhetorical style.
```

**User message:**
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

**Response format expected:**
```
## Counter-arguments
- ...

## Alternative perspectives
- ...

## Caveats and blind spots
- ...
```

Parse response as plain text (no tag extraction needed — unlike summary, there are no tags to parse).

**Parameters:**
```typescript
generateCommentariat(item: ReaderItem, options?: { maxTokens?: number }): Promise<string>
```

### Part 2: API endpoint (`src/app/api/reader/commentariat/route.ts`)

`POST /api/reader/commentariat`

Request body:
```json
{ "itemId": "uuid" }
```

Behaviour:
1. Authenticate user (standard pattern)
2. Fetch `reader_items` row — verify it belongs to the authenticated user
3. Fetch article content (same content-fetching pattern as consumer worker)
4. Call `generateCommentariat()`
5. Write result to `reader_items.commentariat_summary` and `reader_items.commentariat_generated_at`
6. Return `{ commentariat: string }`

Error handling:
- Item not found or not owned by user → 404
- Perplexity API failure → 503 with message (do not store partial result)
- Already has commentariat → regenerate anyway (user explicitly requested it)

### Part 3: Database migration

```sql
ALTER TABLE reader_items
  ADD COLUMN commentariat_summary TEXT,
  ADD COLUMN commentariat_generated_at TIMESTAMPTZ;
```

No index needed — these are display columns, not query columns.

### Part 4: UI (`src/components/ItemCard.tsx` or equivalent)

**Card layout (top to bottom):**
```
[ Article title, metadata ]
─────────────────────────────
[ Summary | Commentariat ]   ← tab bar (new)
─────────────────────────────
[ tab content — summary or commentariat ]
─────────────────────────────
[ Expand | Add note | 👍 👎 ] ← controls row, always visible outside tabs, unchanged position
─────────────────────────────
[ Tags ]                     ← unchanged, always visible, unchanged position
─────────────────────────────
[ Author ] · [ Time to read ] ← unchanged, always visible, unchanged position
```

**Tab bar:**
- Two tabs: "Summary" (default) and "Commentariat"
- Switching tabs does not affect the controls row or tags — those are always visible
- "Expand" in the controls row expands the full tab content area (whichever tab is active)

**Commentariat tab — before generation:**
- Shows "Analyse ideas" button centred in the tab content area
- Loading state: spinner + "Analysing…" (button replaced while in flight, ~5–15s typical)
- Error state: inline message "Analysis unavailable — try again"

**Commentariat tab — after generation:**
- Render with ReactMarkdown (same as summary — headers + bullet points)
- Subtle timestamp below content: "Analysed 2 Apr 2026"
- Small "Refresh" icon/link to regenerate

**Tab order:** Summary (default) | Commentariat

---

## Architecture decision: On-demand only (for now)

Commentariat is triggered by the user clicking "Analyse ideas" — not auto-generated during sync.

**Rationale:**
- Not every article benefits equally. A news brief needs no intellectual stress-test; a long-form essay or research piece does.
- Cost: doubles API usage if generated for everything automatically.
- Latency: summary generation already adds async delay; stacking commentariat would increase queue wait.

**Extensibility path to auto-generation:**
The `generateCommentariat()` function is self-contained. When auto-gen is desired, the queue consumer adds a new `job_type: 'commentariat_generation'` that calls the same function. No restructuring of the API endpoint or UI required — the UI already handles the "already generated" state.

---

## Testing strategy

### Unit tests

**`src/lib/perplexity-api.test.ts`**
- `generateCommentariat()` constructs correct system + user message
- Returns parsed commentariat string on success
- Handles Perplexity API errors gracefully
- Content truncation applied (same as summary)

**`src/app/api/reader/commentariat/route.test.ts`**
- Returns 401 for unauthenticated requests
- Returns 404 for items not owned by user
- Returns 503 on Perplexity failure (no DB write)
- Stores result in DB on success
- Regenerates if already exists

### Manual testing checklist

- [ ] "Analyse ideas" button visible on expanded card with no existing commentariat
- [ ] Loading state displays during generation (~5–15s typical)
- [ ] Commentariat tab appears after successful generation
- [ ] ReactMarkdown renders headers and bullet points correctly
- [ ] "Refresh" icon visible on subsequent views
- [ ] Error message displays cleanly on API failure
- [ ] Generated timestamp shown correctly

---

## Out of scope (future considerations)

- **Custom commentariat prompt** — user-configurable via Settings, following `summary_prompt` pattern. Defer until demand is proven.
- **Auto-generation during sync** — see architecture decision above. Queue consumer extension is straightforward when needed.
- **Commentariat for tags** — not applicable; Commentariat is purely analytical prose.

---

## Pre-commit checklist

- [ ] All tests passing (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Manual testing complete (checklist above)
- [ ] Database migration script included in PR
- [ ] No `console.log` or debug code
- [ ] No secrets in code

---

## PR workflow

**Branch:** `feature/commentariat`
**Review:** `/review-pr-team` — touches API, DB schema, and UI; warrants multi-perspective review

---

## Related documentation

- [Root CLAUDE.md](../CLAUDE.md) - Project navigation
- [REFERENCE/features/ai-summaries.md](../REFERENCE/features/ai-summaries.md) - Summary generation architecture
- [ARCHIVE/features/07-summary-prompt-ui.md](./ARCHIVE/features/07-summary-prompt-ui.md) - Custom prompt precedent
- [technical-debt.md](../REFERENCE/technical-debt.md) - Technical debt tracker
- [Issue #22](https://github.com/mannepanne/ansible-ai-reader/issues/22) - Original feature request
