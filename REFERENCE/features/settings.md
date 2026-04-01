# Settings
REFERENCE > Features > Settings

User settings system for configuring sync intervals and AI summary prompts.

## What Is This?
User preferences page where users can:
- Configure automated sync frequency (0-24 hours) ✅
- Customize AI summary prompt (10-2000 characters) ✅

## Settings API (`/api/settings`)

### GET - Fetch Settings
```typescript
GET /api/settings

Response: {
  sync_interval: 2,  // Hours (0 = disabled)
  summary_prompt: "Custom prompt..." | null
}
```

**Defaults:**
- `sync_interval`: 0 (disabled)
- `summary_prompt`: null (use system default)

### PATCH - Update Settings
```typescript
PATCH /api/settings

Body: {
  sync_interval?: number,        // 0-24
  summary_prompt?: string | null  // 10-2000 chars, null to reset to default
}

Response: { success: true }
```

## Validation

### Sync Interval
```typescript
z.number().int().min(0).max(24).optional()
```

- Minimum: 0 (disabled)
- Maximum: 24 (once per day)
- Integer hours only

### Summary Prompt
```typescript
z.string()
  .min(10)
  .max(2000)
  .transform(prompt => prompt.replace(/<[^>]*>/g, ''))  // Strip HTML
  .refine(prompt => {
    const dangerous = ['ignore previous', 'ignore all', 'system:', 'assistant:'];
    return !dangerous.some(phrase => prompt.toLowerCase().includes(phrase));
  })
  .nullable()
  .optional()
```

`null` = reset to default (clears saved prompt). `undefined` = field not provided (unchanged).

**Security:**
- HTML tags stripped
- Prompt injection patterns blocked
- Length limits enforced

See: [API Validation Pattern](../patterns/api-validation.md)

## Service Role Client Pattern

Settings API uses service role client to bypass RLS:
```typescript
const serviceClient = createServiceRoleClient();
await serviceClient.from('users').upsert({
  id: session.user.id,
  email: session.user.email,
  ...validated.data,
});
```

**Why?** Cookie-based auth doesn't pass JWT to Postgres, so RLS check fails.
**Safe?** Yes - we verify session first, then use service client.

See: [Service Role Pattern](../patterns/service-role-client.md)

## UI Implementation

### Settings Page (`/settings`)

**Implemented:**
- ✅ Sync interval dropdown (0-24 hours)
- ✅ Custom prompt textarea with character counter (0/2000)
- ✅ "Reset to Default" button (clears saved prompt, sends `null`)
- ✅ Tabbed prompt section: **Custom Prompt** tab (editor) and **Full Prompt** tab (read-only view)
- ✅ Inline validation error (min 10 chars if non-empty)
- ✅ Save button with success/error notifications
- ✅ Info text: custom prompt only affects new summaries, not existing ones

### Full Prompt Tab

Shows users exactly what gets sent to Perplexity:
- **System message** — the persona/persona instruction
- **User message template** — the summarization prompt with `[Article Title]`, `[Article Content]` placeholders

The custom prompt is prepended to the user message when set.

### Form Handling
```typescript
// Save: send both fields together
body: JSON.stringify({
  sync_interval: syncInterval,
  summary_prompt: summaryPrompt.length > 0 ? summaryPrompt : null,
})

// Reset to default
body: JSON.stringify({
  sync_interval: syncInterval,
  summary_prompt: null,
})
```

## Database Schema

### users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  sync_interval INTEGER DEFAULT 0,
  summary_prompt TEXT,
  last_auto_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Related Documentation
- [Automated Sync](./automated-sync.md) - How sync intervals are used
- [AI Summaries](./ai-summaries.md) - How custom prompts are used
- [Service Role Pattern](../patterns/service-role-client.md) - RLS bypass
- [API Validation](../patterns/api-validation.md) - Input validation
