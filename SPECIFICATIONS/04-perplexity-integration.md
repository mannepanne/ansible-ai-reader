# Phase 4: Perplexity Integration

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: Phase 3 (Reader Integration)
**Estimated Effort**: Week 3-4

---

## Overview

Integrate with Perplexity API to automatically generate short summaries and tags for items fetched from Reader. By the end of this phase, the sync operation should generate summaries for all unread items.

---

## Scope & Deliverables

### Core Tasks
- [ ] Implement Perplexity API client (TypeScript)
- [ ] Create summary generation function
- [ ] Generate short summaries during sync (bullets, ~2000 chars)
- [ ] Generate tags (3-5 per item)
- [ ] Parse Perplexity response (extract summary and tags)
- [ ] Store summaries and tags in database
- [ ] Display summaries and tags in UI
- [ ] Add loading states ("Generating summary...")
- [ ] Handle API errors and edge cases
- [ ] Implement retry logic for failed summaries

### Out of Scope
- Long summaries (future v1.1)
- Document notes (Phase 5)
- Custom summary prompts (Phase 5)
- Learning from ratings (future v2)

---

## User Flow

```
User clicks "Sync Reader" button
  ↓
For each fetched item:
  1. Store basic item data (Phase 3)
  2. Generate short summary via Perplexity
     - Send article content + user prompt
     - Parse response (summary + tags)
  3. Store summary and tags in database
  4. Show progress: "Processing X of Y..."
  ↓
List view shows:
  - Title
  - Short summary (bullet points)
  - Tags (3-5 keywords)
  - "Archive" button
  ↓
If summary generation fails:
  - Log error to sync_log
  - Show item without summary (title only)
  - Continue processing remaining items
```

---

## API Integration Details

### Perplexity API

**Endpoint**: `POST https://api.perplexity.ai/chat/completions`

**Authentication**: Bearer token (API key in env var)

**Model Selection**:
- Start with `sonar` (good quality, lower cost)
- Upgrade to `sonar-pro` if quality isn't sufficient

**Estimated Cost**: $3-15/month for 20 items/day

### Summary Generation Request

```typescript
const response = await fetch('https://api.perplexity.ai/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates concise summaries. Focus on practical takeaways and novel applications.',
      },
      {
        role: 'user',
        content: `Summarize this article in bullet points (max 2000 characters). Focus on key concepts and practical takeaways. Also provide 3-5 relevant tags.

Title: ${item.title}
Author: ${item.author || 'Unknown'}
Content: ${item.content}`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.2,
  }),
});
```

**Expected Response Format**:
```
## Summary
- Key point 1
- Key point 2
- Key point 3
- ...

## Tags
product-management, ai-applications, software-architecture
```

### Parsing Strategy

```typescript
function parseSummaryResponse(text: string) {
  // Extract summary section
  const summaryMatch = text.match(/## Summary\n([\s\S]*?)(?=\n## Tags|$)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : null;

  // Extract tags section
  const tagsMatch = text.match(/## Tags\n(.*)/);
  const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
  const tags = tagsString.split(',').map(tag => tag.trim()).filter(Boolean);

  return {
    summary,
    tags: tags.length > 0 ? tags : null,
  };
}
```

**Edge Case Handling**:
- Missing summary section → store null, log error
- Missing tags → store empty array
- Malformed response → retry once, then store error in sync_log

---

## Content Access Strategy

**Option A** (preferred): Send full content from Reader API
- Reader API provides article content in response
- Send directly to Perplexity
- ✅ Simple, no extra API calls
- ❌ Content might be incomplete for paywalled articles

**Option C** (fallback): Use Jina AI Reader
- Free service: https://jina.ai/reader
- `https://r.jina.ai/<article_url>` returns clean markdown
- Send to Perplexity
- ✅ Good for web articles
- ❌ Won't work for PDFs or private content

**Implementation**: Start with Option A. If content is empty or < 100 characters, fall back to Jina AI for web URLs.

---

## Testing Strategy

### Required Tests

**1. Perplexity API Client Tests**
- [ ] Summary generation request succeeds
- [ ] Response parsing extracts summary correctly
- [ ] Response parsing extracts tags correctly
- [ ] Handle missing summary section
- [ ] Handle missing tags section
- [ ] Handle malformed responses
- [ ] Retry logic works on failures

**2. Summary Generation Tests**
- [ ] Summary generated for article content
- [ ] Summary respects max length (~2000 chars)
- [ ] Tags array contains 3-5 items
- [ ] Edge case: very long articles (>10k words)
- [ ] Edge case: very short articles (<200 words)
- [ ] Edge case: non-English content

**3. Integration Tests**
- [ ] Sync operation generates summaries for all items
- [ ] Summaries and tags stored in database
- [ ] Failed summaries logged to sync_log
- [ ] Sync continues after individual failures

**4. UI Tests**
- [ ] Summary displayed in bullet format
- [ ] Tags displayed as clickable chips
- [ ] Loading state shows during generation
- [ ] Error state shown for failed summaries

### Test Commands
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode during development
npm run test:coverage     # Coverage report (target: 95%+)
npx tsc --noEmit          # Type checking
```

**Coverage Target**: 100% for new code (enforced minimums: 95% lines/functions/statements, 90% branches)

---

## Pre-Commit Checklist

Before creating a PR for this phase:

- [ ] All tests pass (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Manual testing: summaries generated for real articles
- [ ] Manual testing: tags parsed correctly
- [ ] Perplexity API key documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] Error handling tested (API failures, malformed responses)
- [ ] Cost tracking implemented (log token usage)
- [ ] No secrets committed to repository

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and pre-commit checklist passed.

**PR Title**: `Phase 4: Perplexity Integration - Auto-generate summaries and tags`

**PR Description Template**:
```markdown
## Summary
Completes Phase 4: Perplexity API integration for summary and tag generation.

## What's Included
- Perplexity API client with TypeScript types
- Summary generation (bullet points, ~2000 chars)
- Tag extraction (3-5 keywords)
- Response parsing with edge case handling
- Error handling and retry logic
- UI: display summaries and tags

## Testing
- [x] All tests pass
- [x] Type checking passes
- [x] Coverage: XX% (target: 95%+)
- [x] Manual testing: generated summaries for XX articles
- [x] Manual testing: tag parsing works correctly

## Environment Variables Added
- `PERPLEXITY_API_KEY` (documented in environment-setup.md)

## Cost Monitoring
- Token usage logged to sync_log
- Estimated cost: $X for Y items processed

## Next Steps
Phase 5: Notes, Rating & Polish (document notes, ratings, settings)
```

**Review Process**: Use `/review-pr` for standard review.

---

## Acceptance Criteria

Phase 4 is complete when:

1. ✅ Summaries generated for 95%+ of synced items
2. ✅ Tags extracted and stored correctly
3. ✅ UI displays summaries and tags
4. ✅ Error handling works for API failures
5. ✅ Failed summaries logged to sync_log
6. ✅ All tests passing with 95%+ coverage
7. ✅ Token usage tracking implemented
8. ✅ No secrets in repository
9. ✅ PR merged to main branch

---

## Technical Considerations

### Cost Management
- **Monitor token usage**: Log input/output tokens per request
- **Set billing alerts**: Perplexity dashboard
- **Estimate costs**: Track actual spend vs. estimated
- **Model selection**: Start with `sonar`, upgrade if needed

### API Rate Limits
- Check Perplexity rate limits (requests per minute)
- Implement throttling if needed
- Queue summary generation if rate limited

### Content Length Limits
- Perplexity has max input token limit
- Truncate very long articles (>50k characters)
- Store truncation warning in sync_log

### Prompt Engineering
- **Current prompt**: Generic summary + tags
- **Phase 5**: User-customizable prompt (via settings)
- **Future**: Content-type specific prompts (blog vs paper vs newsletter)

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Perplexity API**: https://docs.perplexity.ai/
- **Jina AI Reader**: https://jina.ai/reader
