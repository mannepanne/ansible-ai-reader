// ABOUT: Weekly reading-day dots for the signed-in user
// ABOUT: Derives Monday-to-Sunday reading days from signals and user archives in the user's timezone

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserFikaSettings, listReadingEvents } from '@/lib/fika/store';
import { readingDays, weekLowerBound } from '@/lib/fika/reading-days';

/**
 * GET /api/fika/reading-days
 *
 * Authentication: Required (session check)
 *
 * Response:
 * - 200: { days: boolean[7], count, target, weekStart }
 * - 401: Not authenticated
 * - 500: Server error
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const settings = (await getUserFikaSettings(supabase, user.id)) ?? { timeZone: 'Europe/London', weeklyTarget: 5 };
    const events = await listReadingEvents(supabase, user.id, weekLowerBound(now, settings.timeZone));

    return NextResponse.json(readingDays({ events, timeZone: settings.timeZone, now, target: settings.weeklyTarget }));
  } catch (error) {
    console.error('[Reading days] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
