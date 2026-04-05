// ABOUT: Shared type definitions for the admin analytics dashboard
// ABOUT: Used by the admin server page and client components

export interface LandingStats {
  totalVisits: number;
  uniqueVisitors: number;
  privacyPageViews: number;
  demoSessions: number;
  totalSignups: number;
  navClicks: { label: string; count: number }[];
  signupSources: { source: string; count: number }[];
}

export interface EmailCaptureRow {
  id: string;
  email: string;
  source: string;
  createdAt: string;
}

export interface DemoSessionRow {
  sessionId: string;
  email: string | null;
  startedAt: string;
  durationSeconds: number;
  totalEvents: number;
}

export interface DemoStats {
  emailCaptureCount: number;
  sessionCount: number;
  totalInteractions: number;
  avgDurationSeconds: number;
  eventTypeBreakdown: { eventType: string; count: number }[];
  sessions: DemoSessionRow[];
  emailCaptures: EmailCaptureRow[];
}
