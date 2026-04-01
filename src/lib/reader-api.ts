// ABOUT: Readwise Reader API client with type-safe validation
// ABOUT: Handles fetching unread items, archiving, rate limiting, and error handling

import { z } from 'zod';
import PQueue from 'p-queue';
import { stripHtml } from './html-utils';

// ====================
// Types and Schemas
// ====================

/**
 * Safe URL validation - only allows http/https protocols
 * Prevents javascript:, data:, file: and other dangerous protocols
 */
const SafeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      const protocol = new URL(url).protocol;
      return protocol === 'http:' || protocol === 'https:';
    },
    {
      message: 'Only HTTP and HTTPS URLs are allowed',
    }
  );

/**
 * Sanitize text content - strip HTML tags for titles/authors
 * First removes script tags with their content, then removes remaining HTML tags
 */
function sanitizeText(text: string): string {
  // Remove script tags and their content
  let sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  return sanitized.trim();
}

/**
 * Reader API item schema with runtime validation
 */
export const ReaderItemSchema = z.object({
  id: z.string().min(1),
  url: SafeUrlSchema,
  title: z.string().min(1).max(1000).transform(sanitizeText),
  author: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .transform((val) => (val ? sanitizeText(val) : undefined)),
  source: z.string().max(200).nullable().optional(),
  word_count: z.number().int().nonnegative().nullable().optional(),
  content: z.string().nullable().optional(),
  created_at: z.string(), // Accept any string format - we'll use it as-is
  content_type: z.string().nullable().optional(),
});

/**
 * Reader API list response schema
 */
export const ReaderListResponseSchema = z.object({
  results: z.array(ReaderItemSchema),
  nextPageCursor: z.string().nullable().optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type ReaderItem = z.infer<typeof ReaderItemSchema>;
export type ReaderListResponse = z.infer<typeof ReaderListResponseSchema>;

/**
 * Reader API error types
 */
export class ReaderAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ReaderAPIError';
  }
}

// ====================
// Rate Limiting Queue
// ====================

/**
 * Rate limiter for Reader API
 * - 20 requests per minute (Reader API limit)
 * - Single concurrency to ensure ordering
 * - 90s timeout per request (prevents memory leaks from hung requests)
 */
const readerQueue = new PQueue({
  concurrency: 1,
  intervalCap: 20, // Max 20 requests
  interval: 60 * 1000, // Per minute
  timeout: 90000, // 90s total timeout (30s per attempt × 3 retries)
});

// ====================
// API Client
// ====================

/**
 * Fetch with retry logic and timeout
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter =
          parseInt(response.headers.get('Retry-After') || '60', 10) * 1000;
        console.warn(
          `[Reader API] Rate limited. Retrying after ${retryAfter}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        continue;
      }

      // Handle server errors with retry
      if (response.status >= 500) {
        if (attempt === maxRetries) {
          throw new ReaderAPIError(
            `Server error: ${response.status}`,
            response.status,
            false
          );
        }
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(
          `[Reader API] Server error ${response.status}. Retrying in ${backoff}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt === maxRetries) {
          throw new ReaderAPIError('Request timeout after 30s', undefined, true);
        }
        console.warn(
          `[Reader API] Request timeout. Retrying (attempt ${attempt}/${maxRetries})...`
        );
        continue;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const backoff = Math.pow(2, attempt) * 1000;
      console.warn(
        `[Reader API] Network error. Retrying in ${backoff}ms...`,
        error
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw new ReaderAPIError('Max retries exceeded', undefined, false);
}

/**
 * Fetch unread items from Readwise Reader
 *
 * @param apiToken - Reader API token
 * @param pageCursor - Pagination cursor (optional)
 * @returns Validated list of reader items
 * @throws {ReaderAPIError} On API errors
 */
export async function fetchUnreadItems(
  apiToken: string,
  pageCursor?: string
): Promise<ReaderListResponse> {
  return readerQueue.add(async () => {
    const url = new URL('https://readwise.io/api/v3/list/');
    url.searchParams.set('location', 'new'); // Unread items only

    if (pageCursor) {
      url.searchParams.set('pageCursor', pageCursor);
    }

    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Token ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new ReaderAPIError(
            'Invalid Reader API token',
            401,
            false
          );
        }

        throw new ReaderAPIError(
          `Reader API error: ${response.status} ${response.statusText}`,
          response.status,
          response.status >= 500
        );
      }

      const data = await response.json();

      // Runtime validation with Zod
      const validated = ReaderListResponseSchema.parse(data);

      console.log(
        `[Reader API] Fetched ${validated.results.length} items` +
          (validated.nextPageCursor ? ' (more available)' : '')
      );

      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[Reader API] Validation error:', error.message);
        throw new ReaderAPIError(
          'Invalid response format from Reader API',
          undefined,
          false
        );
      }

      throw error;
    }
  });
}

/**
 * Archive an item in Readwise Reader
 *
 * @param apiToken - Reader API token
 * @param readerId - Reader item ID
 * @returns Success status
 * @throws {ReaderAPIError} On API errors
 */
export async function archiveItem(
  apiToken: string,
  readerId: string
): Promise<void> {
  return readerQueue.add(async () => {
    const url = `https://readwise.io/api/v3/update/${readerId}/`;

    try {
      const response = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: 'archive',
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new ReaderAPIError(
            'Invalid Reader API token',
            401,
            false
          );
        }

        if (response.status === 404) {
          throw new ReaderAPIError(
            'Item not found in Reader',
            404,
            false
          );
        }

        throw new ReaderAPIError(
          `Failed to archive item: ${response.status} ${response.statusText}`,
          response.status,
          response.status >= 500
        );
      }

      console.log(`[Reader API] Archived item: ${readerId}`);
    } catch (error) {
      console.error('[Reader API] Archive failed:', error);
      throw error;
    }
  });
}

/**
 * Update a document note in Readwise Reader
 *
 * NOTE: This function does NOT use the rate-limited queue (unlike archiveItem).
 * Rationale: Users expect immediate feedback when saving notes (UX priority).
 * For architecture discussion, see: src/app/api/reader/note/route.ts
 *
 * @param apiToken - Reader API token
 * @param readerId - Reader item ID
 * @param note - Plain text note content
 * @returns Success status
 * @throws {ReaderAPIError} On API errors
 */
export async function updateNote(
  apiToken: string,
  readerId: string,
  note: string
): Promise<void> {
  const url = `https://readwise.io/api/v3/update/${readerId}/`;

  try {
    const response = await fetchWithRetry(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notes: note,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new ReaderAPIError(
          'Invalid Reader API token',
          401,
          false
        );
      }

      if (response.status === 404) {
        throw new ReaderAPIError(
          'Item not found in Reader',
          404,
          false
        );
      }

      throw new ReaderAPIError(
        `Failed to update note: ${response.status} ${response.statusText}`,
        response.status,
        response.status >= 500
      );
    }

    console.log(`[Reader API] Updated note for item: ${readerId}`);
  } catch (error) {
    console.error('[Reader API] Note update failed:', error);
    throw error;
  }
}

/**
 * Fetch full article content from Readwise Reader for AI processing
 *
 * Fetches with HTML content included, strips tags to return plain text.
 * Used by on-demand features (e.g. commentariat) that need content at request time.
 *
 * @param readerId - Readwise Reader document ID
 * @param apiToken - Reader API token
 * @returns Article metadata and plain text content
 * @throws {ReaderAPIError} On API errors or missing content
 */
export async function fetchArticleContent(
  readerId: string,
  apiToken: string
): Promise<{ title: string; author?: string; content: string; url: string }> {
  return readerQueue.add(async () => {
    const url = `https://readwise.io/api/v3/list/?id=${encodeURIComponent(readerId)}&withHtmlContent=true`;

    try {
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          Authorization: `Token ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new ReaderAPIError('Invalid Reader API token', 401, false);
        }
        if (response.status >= 400 && response.status < 500) {
          throw new ReaderAPIError(
            `Item not found (HTTP ${response.status})`,
            response.status,
            false
          );
        }
        throw new ReaderAPIError(
          `Reader API error: ${response.status} ${response.statusText}`,
          response.status,
          response.status >= 500
        );
      }

      const data = (await response.json()) as {
        results?: Array<{
          id: string;
          title: string;
          author?: string;
          html_content?: string;
          url: string;
        }>;
      };

      if (!data.results || data.results.length === 0) {
        throw new ReaderAPIError('Item not found in Readwise Reader', 404, false);
      }

      const item = data.results[0];

      if (!item.html_content) {
        throw new ReaderAPIError('Item has no content in Readwise Reader', 422, false);
      }

      const plainText = stripHtml(item.html_content);

      return {
        title: item.title,
        author: item.author,
        content: plainText,
        url: item.url,
      };
    } catch (error) {
      if (error instanceof ReaderAPIError) throw error;
      console.error('[Reader API] Error fetching article content:', error);
      throw new ReaderAPIError('Network error fetching content', undefined, true);
    }
  });
}

/**
 * Get current queue size and pending count
 * Useful for monitoring rate limit compliance
 */
export function getQueueStatus() {
  return {
    size: readerQueue.size,
    pending: readerQueue.pending,
  };
}
