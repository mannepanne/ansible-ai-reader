// ABOUT: Summaries page with Reader integration
// ABOUT: Server component that handles auth and renders client component

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import SummariesContent from './SummariesContent';

export default async function SummariesPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return <SummariesContent userEmail={session.user.email || ''} />;
}
