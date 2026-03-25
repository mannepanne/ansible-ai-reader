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

  return <SettingsContent userEmail={session.user.email || ''} />;
}
