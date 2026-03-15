// ABOUT: Home/landing page with integrated login
// ABOUT: Shows welcome + login form (not authenticated) or welcome + summaries link (authenticated)

import { createClient } from '@/utils/supabase/server';
import HomeContent from './HomeContent';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <HomeContent
      isAuthenticated={!!session}
      userEmail={session?.user?.email}
    />
  );
}
