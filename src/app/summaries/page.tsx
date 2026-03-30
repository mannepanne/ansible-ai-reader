// ABOUT: Summaries page with Reader integration
// ABOUT: Server component that handles auth and renders client component

import { redirect } from 'next/navigation';
import Script from 'next/script';
import { createClient } from '@/utils/supabase/server';
import SummariesContent from './SummariesContent';

export default async function SummariesPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/');
  }

  return (
    <>
      <SummariesContent userEmail={session.user.email || ''} />

      {/* MetricShift feedback widget */}
      <Script
        src="https://cdn.metricshift.co/widget/latest/widget.js"
        strategy="lazyOnload"
      />
      <metricshift-feedback
        project-id="d531cf2c-1063-4a76-b85f-7e715d200def"
        api-key="c0e766f9e4479ccb43258d3849e69ecc46ee7f0c75593fa53dd633d2e63b5375"
        mode="button"
        position="bottom-right"
        variant="outline"
        button-text="Feedback"
        trigger-layout="pill"
        accent-color="#111827"
        welcome-title="Share your feedback"
        success-message="Thank you! Your feedback has been submitted."
        widget-type="general"
        show-branding="true"
        trigger-type="manual"
      />
    </>
  );
}
