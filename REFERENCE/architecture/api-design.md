# API Design
REFERENCE > Architecture > API Design

REST API conventions, error handling patterns, and validation strategies.

## API Conventions

### HTTP Methods
- **GET**: Fetch data (idempotent)
- **POST**: Create new resources or trigger actions
- **PATCH**: Update existing resources (partial update)
- **DELETE**: Remove resources

### URL Structure
```
/api/{domain}/{resource}/{action}
```

**Examples:**
- `/api/auth/login` - Auth domain, login action
- `/api/reader/sync` - Reader domain, sync action
- `/api/reader/items` - Reader domain, items resource
- `/api/settings` - Settings resource (top-level)

### Response Format

**Success:**
```json
{
  "data": { ... },
  "meta": { ... }  // Optional metadata
}
```

**Error:**
```json
{
  "error": "Human-readable message",
  "details": "Additional context",  // Optional
  "hint": "Helpful suggestion"      // Optional
}
```

## Authentication

All protected routes require valid session.

**Pattern:**
```typescript
const supabase = await createClient();
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Protected domains:**
- `/api/reader/*` - Reader operations
- `/api/settings` - User settings

**Public domains:**
- `/api/auth/*` - Authentication
- `/api/cron/*` - Cron endpoints (protected by CRON_SECRET)

## Request Validation

### Zod Schemas
All API inputs validated using [Zod](https://zod.dev/).

**Example: Settings API**
```typescript
import { z } from 'zod';

const settingsSchema = z.object({
  sync_interval: z.number().int().min(0).max(24).optional(),
  summary_prompt: z
    .string()
    .min(10)
    .max(2000)
    .transform((prompt) => prompt.replace(/<[^>]*>/g, '')) // Strip HTML
    .refine(
      (prompt) => {
        const dangerous = ['ignore previous', 'ignore all', 'system:', 'assistant:'];
        return !dangerous.some((phrase) => prompt.toLowerCase().includes(phrase));
      },
      { message: 'Prompt contains potentially dangerous instructions' }
    )
    .optional(),
});

// Usage
const body = await request.json();
const validated = settingsSchema.safeParse(body);

if (!validated.success) {
  return NextResponse.json(
    { error: 'Invalid request body', details: validated.error.issues },
    { status: 400 }
  );
}
```

**Benefits:**
- Type safety
- Automatic validation
- Transform data (strip HTML, normalize)
- Custom refinements (prompt injection prevention)

### Validation Patterns

**Input Sanitization:**
- Strip HTML tags from user input
- Normalize whitespace
- Trim strings

**Security Checks:**
- Prompt injection prevention
- SQL injection prevention (via parameterized queries)
- XSS prevention (via Content-Type headers)

See: [API Validation Pattern](../patterns/api-validation.md)

## Error Handling

### HTTP Status Codes

**2xx Success:**
- `200 OK` - Request succeeded
- `201 Created` - Resource created

**4xx Client Errors:**
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource conflict (e.g., duplicate)

**5xx Server Errors:**
- `500 Internal Server Error` - Unexpected server error
- `503 Service Unavailable` - External service down

### Error Response Pattern

```typescript
try {
  // API logic
} catch (error) {
  console.error('[Context] Error message:', error);

  // Specific errors
  if (error.code === 'SPECIFIC_CODE') {
    return NextResponse.json(
      { error: 'Specific error message', details: error.message },
      { status: 400 }
    );
  }

  // Generic fallback
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
```

**Logging Convention:**
```typescript
console.error('[Component] Context:', { error, userId, data });
```

**Examples:**
- `[Settings] Failed to update settings:`
- `[Reader] Failed to fetch items from Reader API:`
- `[Cron] Auto-sync completed:`

See: [Error Handling Pattern](../patterns/error-handling.md)

## Rate Limiting

### Readwise Reader API
- **Rate limit**: Varies by plan
- **Headers**: `Retry-After` when rate limited
- **Strategy**: Exponential backoff with max retries

**Implementation:**
```typescript
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);

    if (response.ok) {
      return response;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
      continue;
    }

    throw new Error(`Request failed: ${response.status}`);
  }
}
```

### Perplexity API
- **Rate limit**: Varies by plan
- **Strategy**: Sequential processing (not parallel)
- **Timeout**: 30s per request (Cloudflare Worker limit)

## Pagination

### Reader API Pagination
```typescript
let nextPageCursor: string | null = null;

do {
  const response = await fetch(
    `https://readwise.io/api/v3/list/?${new URLSearchParams({
      page_size: '20',
      ...(nextPageCursor && { pageCursor: nextPageCursor }),
    })}`
  );

  const data = await response.json();
  // Process data.results

  nextPageCursor = data.nextPageCursor;
} while (nextPageCursor);
```

**Parameters:**
- `page_size`: Items per page (max 1000, we use 20)
- `pageCursor`: Cursor for next page

## Content Handling

### Large Content Truncation
Perplexity API has 30k character limit.

**Pattern:**
```typescript
const MAX_CONTENT_LENGTH = 30000;

let content = fullContent;
let contentTruncated = false;

if (content.length > MAX_CONTENT_LENGTH) {
  content = content.substring(0, MAX_CONTENT_LENGTH);
  contentTruncated = true;
}

// Store truncation flag
await supabase
  .from('reader_items')
  .update({ content_truncated: contentTruncated })
  .eq('id', itemId);
```

### Markdown Response Parsing
Perplexity returns markdown-formatted responses.

**Expected Format:**
```markdown
**Summary:**
- Key point 1
- Key point 2

**Tags:** tag1, tag2, tag3
```

**Parsing:**
```typescript
function parsePerplexityResponse(markdown: string) {
  const summaryMatch = markdown.match(/\*\*Summary:\*\*\s*\n([\s\S]*?)(?=\*\*Tags:\*\*|$)/);
  const tagsMatch = markdown.match(/\*\*Tags:\*\*\s*(.+)/);

  return {
    summary: summaryMatch?.[1]?.trim() || '',
    tags: tagsMatch?.[1]?.split(',').map(t => t.trim()) || [],
  };
}
```

## API Route Examples

### GET - Fetch Data
```typescript
export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('reader_items')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('archived', false);

  if (error) {
    console.error('[API] Failed to fetch items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
```

### POST - Create or Trigger Action
```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const validated = schema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validated.error.issues },
      { status: 400 }
    );
  }

  // Process action
  return NextResponse.json({ success: true });
}
```

### PATCH - Update Resource
```typescript
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const validated = schema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validated.error.issues },
      { status: 400 }
    );
  }

  // Use service role client if RLS bypass needed
  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient.from('users').upsert({
    id: session.user.id,
    ...validated.data,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
```

## Security Best Practices

### Input Validation
- ✅ Validate all inputs with Zod schemas
- ✅ Sanitize HTML from user input
- ✅ Check for prompt injection patterns
- ✅ Limit string lengths

### Authentication
- ✅ Check session on every protected route
- ✅ Use httpOnly cookies for sessions
- ✅ Verify user owns resources they're accessing

### Database Access
- ✅ Use parameterized queries (Supabase does this)
- ✅ Respect RLS policies
- ✅ Use service role client only when necessary
- ✅ Never expose service role key to client

### Error Handling
- ✅ Log errors with context
- ✅ Don't expose internal errors to users
- ✅ Return generic error messages

## Related Documentation
- [Overview](./overview.md) - System architecture
- [Authentication](./authentication.md) - Auth patterns
- [Workers](./workers.md) - Worker implementation
- [API Validation Pattern](../patterns/api-validation.md) - Validation details
- [Error Handling Pattern](../patterns/error-handling.md) - Error handling details
- [Service Role Pattern](../patterns/service-role-client.md) - RLS bypass pattern
