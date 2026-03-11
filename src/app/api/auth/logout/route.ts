// ABOUT: Logout endpoint for user sign-out
// ABOUT: Clears session and redirects to login page

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Sign out the user
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }

  // Redirect to login page
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
