// ABOUT: Landing page and demo tracking hooks
// ABOUT: Tracks page views, demo interactions, and email captures via Supabase

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Direct anon client for public tracking — bypasses SSR cookie management
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

// ============================================================================
// Session & visitor identity helpers (localStorage-based)
// ============================================================================

export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  const lastActive = localStorage.getItem('ansible_last_active');
  const existingId = localStorage.getItem('ansible_session_id');

  const now = Date.now();
  const timedOut = lastActive && now - Number(lastActive) > SESSION_TIMEOUT_MS;

  if (!existingId || timedOut) {
    const id = crypto.randomUUID();
    localStorage.setItem('ansible_session_id', id);
    localStorage.setItem('ansible_last_active', String(now));
    return id;
  }

  localStorage.setItem('ansible_last_active', String(now));
  return existingId;
}

function touchLastActive() {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ansible_last_active', String(Date.now()));
}

export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('ansible_visitor_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('ansible_visitor_id', id);
  }
  return id;
}

// ============================================================================
// Email capture helpers
// ============================================================================

export function getStoredEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ansible_email');
}

export function setSessionEmail(email: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ansible_email', email);
}

export function clearStoredEmail() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('ansible_email');
}

export async function verifyStoredEmail(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const email = localStorage.getItem('ansible_email');
  if (!email) return false;
  const { data, error } = await supabase.rpc('email_exists', { check_email: email });
  if (error || !data) {
    localStorage.removeItem('ansible_email');
    return false;
  }
  return true;
}

export async function captureEmail(
  email: string,
  source: 'hero' | 'cta',
  consented: boolean
) {
  await supabase.from('email_captures').insert({
    email,
    source,
    consented,
    consented_at: consented ? new Date().toISOString() : null,
  });
}

// ============================================================================
// Demo tracking hook
// ============================================================================

export function useTracking() {
  const sessionId = useRef<string>('');
  const initialized = useRef(false);

  useEffect(() => {
    sessionId.current = getSessionId();
  }, []);

  // Initialize or update session on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const sid = getSessionId();
    sessionId.current = sid;

    const email = getStoredEmail();
    const now = new Date().toISOString();

    supabase
      .from('demo_sessions')
      .insert({
        session_id: sid,
        email,
        started_at: now,
        last_active_at: now,
        total_events: 0,
      })
      .then(({ error }) => {
        if (error) {
          // Session already exists — just bump last_active_at
          supabase
            .from('demo_sessions')
            .update({ last_active_at: now, email })
            .eq('session_id', sid)
            .then();
        }
      });
  }, []);

  // Heartbeat: update last_active_at every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      touchLastActive();
      if (!sessionId.current) return;
      supabase
        .from('demo_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('session_id', sessionId.current)
        .then();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const trackEvent = useCallback(
    (eventType: string, eventData: Record<string, unknown> = {}) => {
      touchLastActive();
      const email = getStoredEmail();
      const sid = sessionId.current;
      if (!sid) return;

      supabase
        .from('demo_events')
        .insert({
          session_id: sid,
          email,
          event_type: eventType,
          event_data: eventData,
        })
        .then();

      supabase.rpc('increment_session_events', { sid }).then();
    },
    []
  );

  return { trackEvent, sessionId: sessionId.current };
}

// ============================================================================
// Landing page tracking hook
// ============================================================================

export function usePageTracking() {
  const visitorId = useRef('');
  const sessionId = useRef('');

  useEffect(() => {
    visitorId.current = getVisitorId();
    sessionId.current = getSessionId();
  }, []);

  const trackPageEvent = useCallback(
    (eventType: string, eventData: Record<string, unknown> = {}) => {
      touchLastActive();
      const vid = visitorId.current || getVisitorId();
      const sid = sessionId.current || getSessionId();
      supabase
        .from('page_events')
        .insert({
          visitor_id: vid,
          session_id: sid,
          event_type: eventType,
          event_data: eventData,
        })
        .then();
    },
    []
  );

  return { trackPageEvent, visitorId: visitorId.current };
}
