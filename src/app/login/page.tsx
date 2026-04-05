// ABOUT: Login page with magic-link authentication form
// ABOUT: Accessible directly via the footer login link on the landing page

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import LoginContent from './LoginContent';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/summaries');
  }

  return <LoginContent />;
}
