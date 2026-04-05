// ABOUT: Settings page for user preferences
// ABOUT: Server component that handles auth and renders client component

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import SettingsContent from './SettingsContent';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  return (
    <SettingsContent
      userEmail={session.user.email || ''}
      isAdmin={userData?.is_admin ?? false}
    />
  );
}
