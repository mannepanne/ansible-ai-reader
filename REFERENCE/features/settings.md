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
  summary_prompt: "Custom prompt..." | null,
  fika_hour: 7 | null,          // Local hour to send the Fika email; null = off
  timezone: "Europe/London",    // IANA zone
  weekly_target: 5              // Reading days per week (1-7)
}
```

**Defaults:**
- `sync_interval`: 0 (disabled)
- `summary_prompt`: null (use system default)
- `fika_hour`: null (Fika off)
- `timezone`: `Europe/London`
- `weekly_target`: 5

### PATCH - Update Settings
```typescript
PATCH /api/settings

Body: {
  sync_interval?: number,         // 0-24
  summary_prompt?: string | null, // 10-2000 chars, null to reset to default
  fika_hour?: number | null,      // 0-23, null to switch Fika off
  timezone?: string,              // IANA zone, validated
  weekly_target?: number          // 1-7
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

### Fika Settings
```typescript
fika_hour: z.number().int().min(0).max(23).nullable().optional()
timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional()  // Intl.DateTimeFormat must accept it
weekly_target: z.number().int().min(1).max(7).optional()
```

The database mirrors these bounds with CHECK constraints. See [fika.md](./fika.md#settings).

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
- ✅ Fika card: send hour select ("Off" or 00:00-23:00), timezone select (prefilled from the browser when the stored value is still the default, saved only on Save), reading days a week (1-7)

### Full Prompt Tab

Shows users exactly what gets sent to Perplexity:
- **System message** — the persona/persona instruction
- **User message template** — the summarization prompt with `[Article Title]`, `[Article Content]` placeholders

The custom prompt is prepended to the user message when set.

### Form Handling
```typescript
// Save: send all fields together (Fika fields via fikaPayload())
body: JSON.stringify({
  sync_interval: syncInterval,
  summary_prompt: summaryPrompt.length > 0 ? summaryPrompt : null,
  fika_hour: fikaHour, timezone, weekly_target: weeklyTarget,
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
