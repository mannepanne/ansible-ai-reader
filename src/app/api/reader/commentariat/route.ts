// ABOUT: On-demand commentariat generation endpoint
// ABOUT: Fetches article content from Reader and generates intellectual critique via Perplexity

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';
import { fetchArticleContent } from '@/lib/reader-api';
import { generateCommentariat } from '@/lib/perplexity-api';

const CommentariatRequestSchema = z.object({
  itemId: z.string().uuid(),
});

/**
 * POST /api/reader/commentariat
 *
 * Fetches article content from Readwise Reader, generates an intellectual
 * critique via Perplexity, and stores the result. Called on-demand when the
 * user clicks "Analyse ideas" on a card.
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - itemId: UUID of the reader_items row
 *
 * Response:
 * - 200: { commentariat: string, generatedAt: string }
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
    const validated = CommentariatRequestSchema.safeParse(body);
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
      console.error('[Commentariat] Missing required API keys');
      return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
    }

    // 5. Fetch article content from Readwise Reader
    let articleContent;
    try {
      articleContent = await fetchArticleContent(item.reader_id, readerApiToken);
    } catch (error) {
      console.error('[Commentariat] Failed to fetch article content:', error);
      return NextResponse.json(
        { error: 'Failed to fetch article content' },
        { status: 503 }
      );
    }

    // 6. Generate commentariat via Perplexity
    let result;
    try {
      result = await generateCommentariat(perplexityApiKey, articleContent);
    } catch (error) {
      console.error('[Commentariat] Generation failed:', error);
      return NextResponse.json(
        { error: 'Analysis generation failed' },
        { status: 503 }
      );
    }

    if (!result.commentariat) {
      return NextResponse.json(
        { error: 'Analysis generation returned empty result' },
        { status: 503 }
      );
    }

    // 7. Store result in database
    const generatedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('reader_items')
      .update({
        commentariat_summary: result.commentariat,
        commentariat_generated_at: generatedAt,
        updated_at: generatedAt,
      })
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[Commentariat] Failed to store result:', updateError);
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
    }

    // 8. Track token usage for cost monitoring (mirrors consumer worker pattern)
    const { error: logError } = await supabase.from('sync_log').insert({
      user_id: user.id,
      sync_type: 'commentariat_generation',
      items_created: 1,
      errors: {
        reader_item_id: itemId,
        token_usage: {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
          model: result.model,
          content_truncated: result.contentTruncated,
          timestamp: generatedAt,
        },
      },
    });

    if (logError) {
      // Non-fatal — log but don't fail the request
      console.error('[Commentariat] Failed to log token usage:', logError);
    }

    return NextResponse.json({
      commentariat: result.commentariat,
      generatedAt,
    });
  } catch (error) {
    console.error('[Commentariat] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
