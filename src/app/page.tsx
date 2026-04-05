// ABOUT: Home page — public landing for unauthenticated visitors
// ABOUT: Authenticated users are redirected to /summaries

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import LandingPage from '@/components/landing/LandingPage';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/summaries');
  }

  return <LandingPage />;
}
