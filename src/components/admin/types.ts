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

// --- Relay agent (autonomous narrator) review surface ---

export interface RelayPieceRow {
  id: string;
  body: string;
  summary: string | null;
  concepts: string[];
  recalledCount: number; // how many memory ids the piece linked to (links.length)
  createdAt: string;
}

export interface RelayDecisionRow {
  verdict: 'wrote' | 'declined';
  pieceId: string | null;
  reason: string | null;
  degraded: string | null;
  stimulusRef: string[];
  createdAt: string;
}

export interface RelayStats {
  counts: { pendingReview: number; approved: number; rejected: number };
  pending: RelayPieceRow[];
  decisions: RelayDecisionRow[];
}
