// ABOUT: Summaries page with Reader integration
// ABOUT: Server component that handles auth and renders client component

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import SummariesContent from './SummariesContent';

export default async function SummariesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return (
    <SummariesContent
      userEmail={user.email || ''}
      isAdmin={userData?.is_admin ?? false}
    />
  );
}
