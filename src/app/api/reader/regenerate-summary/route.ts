// ABOUT: On-demand summary regeneration endpoint
// ABOUT: Fetches article content from Reader and regenerates summary + tags via Perplexity

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';
import { fetchArticleContent } from '@/lib/reader-api';
import { generateSummary } from '@/lib/perplexity-api';

const RegenerateSummaryRequestSchema = z.object({
  itemId: z.string().uuid(),
});

/**
 * POST /api/reader/regenerate-summary
 *
 * Fetches article content from Readwise Reader, regenerates the AI summary
 * and tags via Perplexity, and stores the result. Called on-demand when the
 * user clicks "↺ Refresh" on the Summary tab.
 *
 * Respects the user's custom summary prompt from settings.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - itemId: UUID of the reader_items row
 *
 * Response:
 * - 200: { summary: string | null, tags: string[], contentTruncated: boolean }
 * - 400: Invalid request body
 * - 401: Not authenticated
 * - 404: Item not found or not owned by user
 * - 500: Configuration or storage error
 * - 503: External API failure (Reader or Perplexity)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate request body
    const body = await request.json();
    const validated = RegenerateSummaryRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      );
    }
    const { itemId } = validated.data;

    // 3. Fetch item, verifying ownership
    const { data: item, error: itemError } = await supabase
      .from('reader_items')
      .select('reader_id, title, author, url')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // 4. Check required environment variables
    const readerApiToken = process.env.READER_API_TOKEN;
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

    if (!readerApiToken || !perplexityApiKey) {
      console.error('[Regenerate Summary] Missing required API keys');
      return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
    }

    // 5. Fetch user's custom summary prompt (fall back to default if unavailable)
    let customPrompt: string | undefined;
    try {
      const { data: userSettings } = await supabase
        .from('users')
        .select('summary_prompt')
        .eq('id', user.id)
        .single();
      customPrompt = userSettings?.summary_prompt ?? undefined;
    } catch {
      console.warn('[Regenerate Summary] Could not fetch user prompt, using default');
    }

    // 6. Fetch article content from Readwise Reader
    let articleContent;
    try {
      articleContent = await fetchArticleContent(item.reader_id, readerApiToken);
    } catch (error) {
      console.error('[Regenerate Summary] Failed to fetch article content:', error);
      return NextResponse.json(
        { error: 'Failed to fetch article content' },
        { status: 503 }
      );
    }

    // 7. Generate summary and tags via Perplexity
    let result;
    try {
      result = await generateSummary(perplexityApiKey, articleContent, customPrompt);
    } catch (error) {
      console.error('[Regenerate Summary] Generation failed:', error);
      return NextResponse.json(
        { error: 'Summary generation failed' },
        { status: 503 }
      );
    }

    // 8. Store updated summary and tags in database
    const { error: updateError } = await supabase
      .from('reader_items')
      .update({
        short_summary: result.summary,
        tags: result.tags,
        content_truncated: result.contentTruncated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[Regenerate Summary] Failed to store result:', updateError);
      return NextResponse.json({ error: 'Failed to save summary' }, { status: 500 });
    }

    // 9. Track token usage (non-fatal, mirrors consumer worker pattern)
    const { error: logError } = await supabase.from('sync_log').insert({
      user_id: user.id,
      sync_type: 'summary_regeneration',
      items_created: 1,
      errors: {
        reader_item_id: itemId,
        token_usage: {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
          model: result.model,
          content_truncated: result.contentTruncated,
          timestamp: new Date().toISOString(),
        },
      },
    });

    if (logError) {
      console.error('[Regenerate Summary] Failed to log token usage:', logError);
    }

    return NextResponse.json({
      summary: result.summary,
      tags: result.tags,
      contentTruncated: result.contentTruncated,
    });
  } catch (error) {
    console.error('[Regenerate Summary] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
