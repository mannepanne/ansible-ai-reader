// ABOUT: Perplexity API client for generating AI summaries and tags
// ABOUT: Handles content validation, rate limiting, and response parsing

import { z } from 'zod';
import PQueue from 'p-queue';

// ====================
// Types and Schemas
// ====================

/**
 * Perplexity API request message
 */
interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Perplexity API request payload
 */
interface PerplexityRequest {
  model: 'sonar' | 'sonar-pro';
  messages: PerplexityMessage[];
  max_tokens: number;
  temperature: number;
}

/**
 * Perplexity API response schema with runtime validation
 */
export const PerplexityResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z
    .array(
      z.object({
        index: z.number(),
        message: z.object({
          role: z.string(),
          content: z.string().max(5000), // Prevent absurdly long responses
        }),
        finish_reason: z.string(),
      })
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().positive(),
    completion_tokens: z.number().int().positive(),
    total_tokens: z.number().int().positive(),
  }),
});

/**
 * TypeScript type inferred from schema
 */
export type PerplexityResponse = z.infer<typeof PerplexityResponseSchema>;

/**
 * Parsed summary and tags schema
 */
export const ParsedSummarySchema = z.object({
  summary: z.string().min(10).max(2000).nullable(),
  tags: z.array(z.string().min(1).max(50)).max(10),
});

/**
 * TypeScript type for parsed summary
 */
export type ParsedSummary = z.infer<typeof ParsedSummarySchema>;

/**
 * Commentariat generation result
 */
export interface CommentariatResult {
  commentariat: string | null;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  contentTruncated: boolean;
}

/**
 * Summary generation result
 */
export interface SummaryGenerationResult {
  summary: string | null;
  tags: string[];
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  contentTruncated: boolean;
}

/**
 * Perplexity API error types
 */
export class PerplexityAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'PerplexityAPIError';
  }
}

// ====================
// Rate Limiting Queue
// ====================

/**
 * Rate limiter for Perplexity API
 * - 50 requests per minute (Perplexity API limit for sonar model)
 * - Single concurrency to ensure ordering
 * - 90s timeout per request (prevents memory leaks from hung requests)
 */
const perplexityQueue = new PQueue({
  concurrency: 1,
  intervalCap: 50, // Max 50 requests
  interval: 60 * 1000, // Per minute
  timeout: 90000, // 90s total timeout
});

// ====================
// Content Validation
// ====================

/**
 * Smart truncation for long content
 * Keeps first 80% and last 20% to preserve intro and conclusion
 *
 * @param content - Article content to truncate
 * @param maxChars - Maximum character count (default: 30,000)
 * @returns Truncated content and truncation flag
 */
export function smartTruncate(
  content: string,
  maxChars: number = 30000
): { content: string; truncated: boolean } {
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }

  // Keep first 80% and last 20% to preserve intro and conclusion
  const keepStart = Math.floor(maxChars * 0.8);
  const keepEnd = maxChars - keepStart;

  const truncated =
    content.substring(0, keepStart) +
    '\n\n[... content truncated for length ...]\n\n' +
    content.substring(content.length - keepEnd);

  return { content: truncated, truncated: true };
}

// ====================
// Response Parsing
// ====================

/**
 * Parse Perplexity response to extract summary and tags
 *
 * Expected format:
 * ## Summary
 * - Point 1
 * - Point 2
 *
 * ## Tags
 * tag1, tag2, tag3
 *
 * @param text - Raw response text from Perplexity
 * @returns Parsed summary and tags with validation
 */
export function parseSummaryResponse(text: string): ParsedSummary {
  // Extract summary section (everything between "## Summary" and "## Tags" or end)
  const summaryMatch = text.match(/## Summary\n([\s\S]*?)(?=\n## Tags|$)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : null;

  // Extract tags section (comma-separated list after "## Tags")
  const tagsMatch = text.match(/## Tags\n(.*)/);
  const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
  const tags = tagsString
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  // Validate with Zod
  const result = ParsedSummarySchema.safeParse({ summary, tags });

  if (!result.success) {
    console.error('[Perplexity] Validation error:', result.error.message);
    // Return partial result on validation failure
    return {
      summary,
      tags: tags.length > 0 ? tags.slice(0, 10) : [], // Limit to 10 tags
    };
  }

  return result.data;
}

// ====================
// API Client
// ====================

/**
 * Fetch with retry logic and timeout
 *
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Response object
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

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
          `[Perplexity API] Rate limited. Retrying after ${retryAfter}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        continue;
      }

      // Handle server errors with retry
      if (response.status >= 500) {
        if (attempt === maxRetries) {
          throw new PerplexityAPIError(
            `Server error: ${response.status}`,
            response.status,
            false
          );
        }
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(
          `[Perplexity API] Server error ${response.status}. Retrying in ${backoff}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt === maxRetries) {
          throw new PerplexityAPIError(
            'Request timeout after 60s',
            undefined,
            true
          );
        }
        console.warn(
          `[Perplexity API] Request timeout. Retrying (attempt ${attempt}/${maxRetries})...`
        );
        continue;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const backoff = Math.pow(2, attempt) * 1000;
      console.warn(
        `[Perplexity API] Network error. Retrying in ${backoff}ms...`,
        error
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw new PerplexityAPIError('Max retries exceeded', undefined, false);
}

/**
 * Generate AI summary and tags for article content
 *
 * @param apiToken - Perplexity API key
 * @param item - Article metadata and content
 * @returns Summary, tags, token usage, and metadata
 * @throws {PerplexityAPIError} On API errors
 */
export async function generateSummary(
  apiToken: string,
  item: {
    title: string;
    author?: string;
    content: string;
    url: string;
  },
  customPrompt?: string
): Promise<SummaryGenerationResult> {
  return perplexityQueue.add(async () => {
    // 1. Validate and truncate content
    const { content, truncated } = smartTruncate(item.content);

    if (truncated) {
      console.log(
        `[Perplexity API] Content truncated for item: ${item.title}`
      );
    }

    // 2. Prepare API request
    const requestBody: PerplexityRequest = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content:
            'You are summarising content for a person who is evidence-driven and time-poor. Focus on key take aways and novel discoveries. Prioritise signal over noise.',
        },
        {
          role: 'user',
          content: `${customPrompt ? customPrompt + '\n\n' : ''}Summarize this article (max 2000 characters). Also provide 3-5 relevant tags.

Title: ${item.title}
Author: ${item.author || 'Unknown'}
Content: ${content}

Your response must include a ## Summary section and a ## Tags section. Structure the summary however best fits the content and any additional instructions above.

## Tags should be a comma-separated list, e.g.: tag1, tag2, tag3`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    };

    try {
      // 3. Send request with retry logic
      const response = await fetchWithRetry(
        'https://api.perplexity.ai/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new PerplexityAPIError(
            'Invalid Perplexity API token',
            401,
            false
          );
        }

        throw new PerplexityAPIError(
          `Perplexity API error: ${response.status} ${response.statusText}`,
          response.status,
          response.status >= 500
        );
      }

      const data = await response.json();

      // 4. Runtime validation with Zod
      const validated = PerplexityResponseSchema.parse(data);

      // 5. Parse summary and tags
      const responseText = validated.choices[0].message.content;
      const { summary, tags } = parseSummaryResponse(responseText);

      console.log(
        `[Perplexity API] Generated summary for: ${item.title} (${validated.usage.total_tokens} tokens)`
      );

      return {
        summary,
        tags,
        model: validated.model,
        usage: validated.usage,
        contentTruncated: truncated,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[Perplexity API] Validation error:', error.message);
        throw new PerplexityAPIError(
          'Invalid response format from Perplexity API',
          undefined,
          false
        );
      }

      throw error;
    }
  });
}

/**
 * Generate intellectual critique and counter-perspectives for article content
 *
 * Uses Perplexity's web search to surface counter-arguments, alternative
 * schools of thought, and caveats from across the wider knowledge base.
 *
 * @param apiToken - Perplexity API key
 * @param item - Article metadata and content
 * @returns Commentariat text, token usage, and metadata
 * @throws {PerplexityAPIError} On API errors
 */
export async function generateCommentariat(
  apiToken: string,
  item: {
    title: string;
    author?: string;
    content: string;
    url: string;
  }
): Promise<CommentariatResult> {
  return perplexityQueue.add(async () => {
    const { content, truncated } = smartTruncate(item.content);

    if (truncated) {
      console.log(`[Perplexity API] Content truncated for commentariat: ${item.title}`);
    }

    const requestBody: PerplexityRequest = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content:
            'You are a sharp, well-read critic helping a busy reader cut through the noise. Be concise, direct, and editorial — not academic.',
        },
        {
          role: 'user',
          content: `Today's date is ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.

What are the 2–3 most important things a sceptical reader should know before taking this article at face value?

Pick only what matters most: a significant unstated assumption, a strong counter-argument from established knowledge, or important context the author left out. Skip anything minor.

Be specific. No vague hedging. Keep it short — the reader is time-poor.

Title: ${item.title}
Author: ${item.author || 'Unknown'}

Content:
${content}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    };

    try {
      const response = await fetchWithRetry(
        'https://api.perplexity.ai/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new PerplexityAPIError('Invalid Perplexity API token', 401, false);
        }

        throw new PerplexityAPIError(
          `Perplexity API error: ${response.status} ${response.statusText}`,
          response.status,
          response.status >= 500
        );
      }

      const data = await response.json();
      const validated = PerplexityResponseSchema.parse(data);
      const commentariat = validated.choices[0].message.content;

      console.log(
        `[Perplexity API] Generated commentariat for: ${item.title} (${validated.usage.total_tokens} tokens)`
      );

      return {
        commentariat,
        model: validated.model,
        usage: validated.usage,
        contentTruncated: truncated,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[Perplexity API] Validation error:', error.message);
        throw new PerplexityAPIError(
          'Invalid response format from Perplexity API',
          undefined,
          false
        );
      }

      throw error;
    }
  });
}

/**
 * Get current queue size and pending count
 * Useful for monitoring rate limit compliance
 */
export function getQueueStatus() {
  return {
    size: perplexityQueue.size,
    pending: perplexityQueue.pending,
  };
}
