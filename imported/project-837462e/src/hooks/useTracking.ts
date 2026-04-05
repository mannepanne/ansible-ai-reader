import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getSessionId(): string {
  const lastActive = localStorage.getItem("ansible_last_active");
  const existingId = localStorage.getItem("ansible_session_id");

  const now = Date.now();
  const timedOut = lastActive && now - Number(lastActive) > SESSION_TIMEOUT_MS;

  if (!existingId || timedOut) {
    const id = crypto.randomUUID();
    localStorage.setItem("ansible_session_id", id);
    localStorage.setItem("ansible_last_active", String(now));
    return id;
  }

  localStorage.setItem("ansible_last_active", String(now));
  return existingId;
}

function touchLastActive() {
  localStorage.setItem("ansible_last_active", String(Date.now()));
}

function getVisitorId(): string {
  let id = localStorage.getItem("ansible_visitor_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ansible_visitor_id", id);
  }
  return id;
}

function getEmail(): string | null {
  return localStorage.getItem("ansible_email");
}

export function getStoredEmail(): string | null {
  return localStorage.getItem("ansible_email");
}

export function clearStoredEmail() {
  localStorage.removeItem("ansible_email");
}

export async function verifyStoredEmail(): Promise<boolean> {
  const email = localStorage.getItem("ansible_email");
  if (!email) return false;
  const { data, error } = await supabase.rpc("email_exists", { check_email: email });
  if (error || !data) {
    localStorage.removeItem("ansible_email");
    return false;
  }
  return true;
}

export function setSessionEmail(email: string) {
  localStorage.setItem("ansible_email", email);
}

export async function captureEmail(email: string, source: "hero" | "cta", consented: boolean) {
  await supabase.from("email_captures").insert({
    email,
    source,
    consented,
    consented_at: consented ? new Date().toISOString() : null,
  });
}

export function useTracking() {
  const sessionId = useRef(getSessionId());
  const initialized = useRef(false);

  // Initialize or update session on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const email = getEmail();
    const now = new Date().toISOString();

    // Try to insert a new session; if it already exists, just update last_active_at
    supabase
      .from("demo_sessions")
      .insert({
        session_id: sessionId.current,
        email,
        started_at: now,
        last_active_at: now,
        total_events: 0,
      })
      .then(({ error }) => {
        if (error) {
          // Session already exists — just bump last_active_at
          supabase
            .from("demo_sessions")
            .update({ last_active_at: now, email })
            .eq("session_id", sessionId.current)
            .then();
        }
      });
  }, []);

  // Heartbeat: update last_active_at every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      touchLastActive();
      supabase
        .from("demo_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("session_id", sessionId.current)
        .then();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const trackEvent = useCallback(
    (eventType: string, eventData: Record<string, unknown> = {}) => {
      touchLastActive();
      const email = getEmail();
      supabase
        .from("demo_events")
        .insert({
          session_id: sessionId.current,
          email,
          event_type: eventType,
          event_data: eventData,
        })
        .then();

      // Increment total_events on the session
      supabase.rpc("increment_session_events", {
        sid: sessionId.current,
      }).then();
    },
    []
  );

  return { trackEvent, sessionId: sessionId.current };
}

export function usePageTracking() {
  const visitorId = useRef(getVisitorId());
  const sessionId = useRef(getSessionId());

  const trackPageEvent = useCallback(
    (eventType: string, eventData: Record<string, unknown> = {}) => {
      touchLastActive();
      supabase
        .from("page_events")
        .insert({
          visitor_id: visitorId.current,
          session_id: sessionId.current,
          event_type: eventType,
          event_data: eventData,
        })
        .then();
    },
    []
  );

  return { trackPageEvent, visitorId: visitorId.current };
}
