// ABOUT: API endpoint for user settings (sync interval, summary prompt)
// ABOUT: GET fetches current settings, PATCH updates settings with validation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

// Note: Using Node.js runtime (nodejs_compat) instead of edge runtime
// OpenNext requires edge runtime functions to be defined separately

const SummaryPromptSchema = z
  .string()
  .min(10, 'Prompt must be at least 10 characters')
  .max(2000, 'Prompt must be under 2000 characters')
  .transform((prompt) => {
    // Strip HTML tags
    return prompt.replace(/<[^>]*>/g, '');
  })
  .refine(
    (prompt) => {
      // Prevent obvious injection attempts
      const dangerous = [
        'ignore previous',
        'ignore all',
        'system:',
        'assistant:',
      ];
      const lower = prompt.toLowerCase();
      return !dangerous.some((phrase) => lower.includes(phrase));
    },
    {
      message: 'Prompt contains potentially dangerous instructions',
    }
  );

const settingsSchema = z.object({
  sync_interval: z.number().int().min(0).max(24).optional(),
  summary_prompt: SummaryPromptSchema.optional(),
});

/**
 * GET /api/settings
 *
 * Fetches current user settings (sync_interval, summary_prompt).
 * Returns defaults if user record doesn't exist yet.
 *
 * Authentication: Required (session check)
 *
 * Response:
 * - 200: { sync_interval, summary_prompt }
 * - 401: Not authenticated
 * - 500: Server error
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('sync_interval, summary_prompt')
      .eq('id', session.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (user doesn't exist yet)
      console.error('[Settings] Failed to fetch settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      );
    }

    // Return defaults if user doesn't exist yet
    return NextResponse.json({
      sync_interval: user?.sync_interval ?? 0,
      summary_prompt: user?.summary_prompt ?? null,
    });
  } catch (error) {
    console.error('[Settings] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 *
 * Updates user settings (sync_interval, summary_prompt).
 * Creates user record if it doesn't exist (upsert).
 *
 * Authentication: Required (session check)
 *
 * Request body:
 * - sync_interval?: number (0-24, where 0 = disabled)
 * - summary_prompt?: string (10-2000 chars)
 *
 * Response:
 * - 200: { success: true }
 * - 400: Invalid request body
 * - 401: Not authenticated
 * - 500: Server error
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate request body
    const validated = settingsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.issues },
        { status: 400 }
      );
    }

    // Upsert user settings
    const { error } = await supabase.from('users').upsert(
      {
        id: session.user.id,
        email: session.user.email,
        ...validated.data,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.error('[Settings] Failed to update settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Settings] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
