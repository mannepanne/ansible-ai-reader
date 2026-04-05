// ABOUT: Shared type definitions for the admin analytics dashboard
// ABOUT: Used by the admin server page and client components

export interface LandingStats {
  totalVisits: number;
  uniqueVisitors: number;
  totalSignups: number;
  navClicks: { label: string; count: number }[];
  signupSources: { source: string; count: number }[];
}

export interface DemoSessionRow {
  sessionId: string;
  email: string | null;
  startedAt: string;
  durationMinutes: number;
  totalEvents: number;
}

export interface DemoStats {
  emailCaptureCount: number;
  sessionCount: number;
  totalInteractions: number;
  avgDurationMinutes: number;
  eventTypeBreakdown: { eventType: string; count: number }[];
  sessions: DemoSessionRow[];
}
