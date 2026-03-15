// ABOUT: HTML utility functions for content processing
// ABOUT: Shared utilities for stripping HTML tags and decoding entities

/**
 * Strip HTML tags and decode entities from content
 *
 * Removes:
 * - Script tags and their content (security)
 * - Style tags and their content
 * - All HTML tags
 * - HTML entities (converts to plain text)
 * - Normalizes whitespace
 *
 * Used by both local dev consumer and production consumer to convert
 * HTML content from Reader API into plain text for Perplexity summarization.
 *
 * @param html - HTML string to strip
 * @returns Plain text with HTML removed and entities decoded
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
    .replace(/<[^>]+>/g, '') // Remove all tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}
