// ABOUT: Shared type definitions for the admin analytics dashboard
// ABOUT: Used by the admin server page and client components

import type { ReaderLink } from '@/lib/relay/review-stimulus';

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

// A piece's provenance link: a `recall` ref points at a memory (ref = a title or short id), a `source`
// ref at a research URL. The reviewer sees these so grounding is visible, not just asserted.
export interface PieceLink {
  type: 'recall' | 'source';
  ref: string;
  title?: string;
}

// A research source consulted in a session (recorded on the decision, for writes AND declines).
export interface DecisionSource {
  quote: string;
  source_url: string;
  source_title: string;
}

export interface RelayPieceRow {
  id: string;
  body: string;
  summary: string | null;
  concepts: string[];
  recalledCount: number; // how many recall (memory) links the piece drew on
  // 'sourced' = the piece cites at least one research URL; 'unverified' = it does not (NOT "false").
  // 'verified' is reserved for the deferred re-verification pass and not produced in 2.1.
  verificationStatus: string;
  sourceLinks: PieceLink[]; // the type:'source' links, surfaced as clickable provenance
  // Stage 2.2a taste-signal capture (Channel 2): the reviewer's note (the "why" of a decision) and, when
  // the body was edited on approval, the piece as Relay first wrote it (write-once — the edit delta).
  reviewNote: string | null;
  originalBody: string | null;
  // Reconstructed (current formatStimulus logic) view of what this piece was written from, plus Reader
  // deep-links to the source article(s). Reconstruction, not stored text — see review-stimulus.ts.
  stimulus: string | null;
  readerLinks: ReaderLink[];
  createdAt: string;
}

export interface RelayDecisionRow {
  verdict: 'wrote' | 'declined';
  pieceId: string | null;
  reason: string | null;
  degraded: string | null;
  stimulusRef: string[];
  stimulusTitles: string[]; // titles of the reader_items behind stimulusRef (the material decided on)
  pieceSummary: string | null; // for 'wrote': a summary of the piece that resulted
  sources: DecisionSource[]; // research consulted this session (the only provenance on a decline)
  createdAt: string;
}

export interface RelayStats {
  // pendingReview/approved/rejected are piece-gate states; wrote/declined are decision verdicts.
  counts: { pendingReview: number; approved: number; rejected: number; wrote: number; declined: number };
  pending: RelayPieceRow[];
  approved: RelayPieceRow[];
  rejected: RelayPieceRow[];
  decisions: RelayDecisionRow[];
}
