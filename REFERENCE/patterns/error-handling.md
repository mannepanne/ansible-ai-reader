# Error Handling Pattern
REFERENCE > Patterns > Error Handling

Consistent error responses, logging, and debugging across the application.

## When to Read This
- Implementing error handling in API routes
- Debugging production errors
- Understanding error logging patterns
- Creating user-friendly error messages
- Monitoring application health

## Related Documentation
- [Operations - Monitoring](../operations/monitoring.md) - Production logs and debugging
- [Operations - Troubleshooting](../operations/troubleshooting.md) - Common errors
- [API Validation](./api-validation.md) - Input validation errors
- [Queue Processing](./queue-processing.md) - Async error handling

---

## Error Categories

### 1. Client Errors (4xx)

User-caused errors - invalid input, missing auth, etc.

**401 Unauthorized:**
```typescript
return NextResponse.json(
  { error: 'Authentication required' },
  { status: 401 }
);
```

**400 Bad Request:**
```typescript
return NextResponse.json(
  { error: 'Invalid request', details: validationError },
  { status: 400 }
);
```

**403 Forbidden:**
```typescript
return NextResponse.json(
  { error: 'Access denied' },
  { status: 403 }
);
```

**404 Not Found:**
```typescript
return NextResponse.json(
  { error: 'Resource not found' },
  { status: 404 }
);
```

### 2. Server Errors (5xx)

Application-caused errors - bugs, external service failures, etc.

**500 Internal Server Error:**
```typescript
return NextResponse.json(
  { error: 'An unexpected error occurred' },
  { status: 500 }
);
```

**502 Bad Gateway:**
```typescript
return NextResponse.json(
  { error: 'External service unavailable' },
  { status: 502 }
);
```

**503 Service Unavailable:**
```typescript
return NextResponse.json(
  { error: 'Service temporarily unavailable' },
  { status: 503 }
);
```

---

## Error Response Format

### Standard Format

```typescript
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",      // Optional: Machine-readable code
  "details": { ... },         // Optional: Additional context
  "timestamp": "2026-03-26T..." // Optional: When error occurred
}
```

### Examples

**Simple error:**
```json
{
  "error": "Unauthorized"
}
```

**Detailed error:**
```json
{
  "error": "Failed to sync Reader items",
  "code": "READER_API_ERROR",
  "details": {
    "statusCode": 429,
    "retryAfter": 30
  }
}
```

**Validation error:**
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "sync_interval",
      "message": "Must be between 0 and 24"
    }
  ]
}
```

---

## API Error Handling Pattern

### Standard Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate authentication
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Validate input
    const body = await req.json();
    const validated = schema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0].message },
        { status: 400 }
      );
    }

    // 3. Process request
    const result = await processRequest(validated.data);

    // 4. Return success
    return NextResponse.json(result);

  } catch (error) {
    // 5. Log error
    console.error('[API] Unexpected error:', error);

    // 6. Return generic error (don't expose internals)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
```

### External API Errors

```typescript
async function fetchReaderItems(token: string) {
  try {
    const response = await fetch(READER_API_URL, {
      headers: { Authorization: `Token ${token}` },
    });

    if (!response.ok) {
      // Classify error
      if (response.status === 401) {
        throw new Error('Invalid Reader API token');
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      }

      if (response.status >= 500) {
        throw new Error('Reader API temporarily unavailable');
      }

      throw new Error(`Reader API error: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    // Re-throw with context
    console.error('[Reader] API error:', error);
    throw error;
  }
}
```

---

## Logging Patterns

### Log Levels

**Error (always log):**
```typescript
console.error('[API] Failed to process request:', error);
console.error('[Reader] API returned 500:', error.message);
console.error('[Database] Connection failed:', error);
```

**Warning (potential issues):**
```typescript
console.warn('[Reader] Rate limit approaching:', rateLimitRemaining);
console.warn('[Queue] Job retrying (attempt 2/3):', jobId);
console.warn('[Perplexity] Content truncated:', contentLength);
```

**Info (normal operations):**
```typescript
console.log('[Sync] Started for user:', userId);
console.log('[Consumer] Processing job:', jobId);
console.log('[Perplexity] Token usage:', tokens);
```

### Structured Logging

```typescript
// Good: Consistent format with context
console.log('[Reader]', {
  action: 'fetch_items',
  userId,
  itemCount: items.length,
  duration: Date.now() - startTime,
});

// Bad: Unstructured
console.log('Got items', items.length);
```

### Log Prefixes

Use consistent prefixes for easy filtering:

```typescript
'[API]'         // API routes
'[Reader]'      // Reader API client
'[Perplexity]'  // Perplexity API client
'[Auth]'        // Authentication
'[Database]'    // Database operations
'[Queue]'       // Queue operations
'[Consumer]'    // Consumer worker
'[Cron]'        // Cron worker
'[Sync]'        // Sync operations
'[Error]'       // Error cases
```

**Filtering logs:**
```bash
# Show only Reader-related logs
npx wrangler tail | grep "\[Reader\]"

# Show only errors
npx wrangler tail | grep "\[Error\]"
```

---

## Error Classes

### Custom Error Types

```typescript
// lib/errors.ts

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class ValidationError extends APIError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends APIError {
  constructor(public retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}s`, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}
```

### Using Custom Errors

```typescript
import { AuthenticationError, RateLimitError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      throw new AuthenticationError();
    }

    const result = await fetchReaderItems(session.user.id);
    return NextResponse.json(result);

  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.statusCode }
      );
    }

    // Generic error
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
```

---

## Database Error Handling

### RLS Policy Violations

```typescript
try {
  await supabase
    .from('reader_items')
    .insert({ user_id: userId, ... });
} catch (error) {
  if (error.code === '42501') {  // RLS violation
    console.error('[Database] RLS policy violation:', {
      userId,
      table: 'reader_items',
      operation: 'insert',
    });

    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }

  throw error;  // Re-throw other errors
}
```

### Unique Constraint Violations

```typescript
try {
  await supabase
    .from('reader_items')
    .insert({ user_id: userId, reader_id: readerId });
} catch (error) {
  if (error.code === '23505') {  // Unique violation
    console.log('[Database] Item already exists:', readerId);

    // Use upsert instead
    await supabase
      .from('reader_items')
      .upsert({ user_id: userId, reader_id: readerId });
  } else {
    throw error;
  }
}
```

### Connection Errors

```typescript
try {
  const { data, error } = await supabase
    .from('reader_items')
    .select('*');

  if (error) {
    console.error('[Database] Query error:', error);
    throw new Error('Database query failed');
  }

  return data;

} catch (error) {
  console.error('[Database] Connection error:', error);
  return NextResponse.json(
    { error: 'Database temporarily unavailable' },
    { status: 503 }
  );
}
```

---

## User-Friendly Error Messages

### Don't Expose Internals

```typescript
// Bad: Exposes internal details
return NextResponse.json(
  { error: 'TypeError: Cannot read property "id" of undefined at line 42' },
  { status: 500 }
);

// Good: Generic message, details in logs
console.error('[API] Internal error:', error);
return NextResponse.json(
  { error: 'An unexpected error occurred' },
  { status: 500 }
);
```

### Provide Actionable Guidance

```typescript
// Bad: Unclear
{ error: 'Invalid input' }

// Good: Explains what's wrong and how to fix
{ error: 'Sync interval must be between 0 and 24 hours' }
```

### Be Specific for Client Errors

```typescript
// Bad: Too generic
{ error: 'Validation failed' }

// Good: Specific field and issue
{
  error: 'Validation failed',
  details: [
    { field: 'email', message: 'Invalid email format' },
    { field: 'password', message: 'Password too short (min 8 chars)' }
  ]
}
```

---

## Monitoring and Alerting

### Error Rate Monitoring

Track error rates by endpoint:

```typescript
const startTime = Date.now();
try {
  const result = await processRequest();
  // Log success
  console.log('[API] Request completed:', {
    endpoint: '/api/reader/sync',
    duration: Date.now() - startTime,
    status: 'success',
  });
  return NextResponse.json(result);
} catch (error) {
  // Log failure
  console.error('[API] Request failed:', {
    endpoint: '/api/reader/sync',
    duration: Date.now() - startTime,
    status: 'error',
    error: error.message,
  });
  return NextResponse.json({ error: 'Failed' }, { status: 500 });
}
```

### Setting Up Alerts

**Cloudflare Workers (Paid Plan):**
- Configure alerts for error rate > 5%
- Alert on CPU time > 40ms average
- Alert on request rate spikes

**Manual Monitoring:**
- Daily: Review error logs
- Weekly: Check error trends
- Monthly: Analyze patterns

---

## Testing Error Cases

### Unit Tests

```typescript
describe('API Error Handling', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const req = createMockRequest({ authenticated: false });
    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required',
    });
  });

  it('returns 400 for invalid input', async () => {
    const req = createMockRequest({
      body: { sync_interval: -1 },  // Invalid
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 500 for unexpected errors', async () => {
    mockDatabase.mockRejectedValueOnce(new Error('DB error'));

    const req = createMockRequest({ authenticated: true });
    const response = await POST(req);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'An unexpected error occurred',
    });
  });
});
```

---

## Best Practices

### 1. Log Before Returning Error

```typescript
// Good: Log details, return generic message
console.error('[API] Failed to fetch Reader items:', error);
return NextResponse.json(
  { error: 'Failed to sync items' },
  { status: 500 }
);

// Bad: Silent failure
return NextResponse.json({ error: 'Failed' }, { status: 500 });
```

### 2. Include Context in Logs

```typescript
// Good: Context for debugging
console.error('[Reader] API error:', {
  userId,
  endpoint: 'https://readwise.io/api/v3/list/',
  statusCode: response.status,
  error: error.message,
});

// Bad: No context
console.error('Error:', error);
```

### 3. Don't Swallow Errors

```typescript
// Bad: Silent failure
try {
  await riskyOperation();
} catch (error) {
  // Nothing!
}

// Good: Log and handle
try {
  await riskyOperation();
} catch (error) {
  console.error('[API] Operation failed:', error);
  throw error;  // Or handle appropriately
}
```

### 4. Use Appropriate Status Codes

```typescript
// Bad: Everything is 500
return NextResponse.json({ error: 'No auth' }, { status: 500 });

// Good: Correct status codes
return NextResponse.json({ error: 'No auth' }, { status: 401 });
```

---

## Common Pitfalls

### 1. Exposing Sensitive Information

```typescript
// Bad: Exposes API key
{ error: `Reader API failed with token ${API_TOKEN}` }

// Good: Generic message
{ error: 'Reader API unavailable' }
```

### 2. Generic Error Messages

```typescript
// Bad: Not actionable
{ error: 'Something went wrong' }

// Good: Specific and actionable
{ error: 'Invalid email format' }
```

### 3. Not Logging Enough Context

```typescript
// Bad: Hard to debug
console.error('Error:', error.message);

// Good: Full context
console.error('[API] Request failed:', {
  userId,
  endpoint: req.url,
  method: req.method,
  error: error.message,
  stack: error.stack,
});
```

---

## Related Documentation

- [Operations - Monitoring](../operations/monitoring.md) - Production logs and metrics
- [Operations - Troubleshooting](../operations/troubleshooting.md) - Common errors and solutions
- [API Validation](./api-validation.md) - Input validation patterns
- [Queue Processing](./queue-processing.md) - Async error handling
- [Service Role Client](./service-role-client.md) - RLS error handling
