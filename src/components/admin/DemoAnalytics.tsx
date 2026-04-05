// ABOUT: Demo session analytics panel for the admin dashboard
// ABOUT: Shows session metrics, engagement bar charts, email captures with GDPR actions, and session table

'use client';

import { useState } from 'react';
import type { DemoStats, DemoSessionRow, EmailCaptureRow } from './types';
import { StatCard, BarChart, SECTION_HEADING, formatDuration } from './ui';

interface DemoAnalyticsProps {
  stats: DemoStats;
}

export default function DemoAnalytics({ stats }: DemoAnalyticsProps) {
  const [emailCaptures, setEmailCaptures] = useState<EmailCaptureRow[]>(stats.emailCaptures);
  const [sessions, setSessions] = useState<DemoSessionRow[]>(stats.sessions);
  const [emailCaptureCount, setEmailCaptureCount] = useState(stats.emailCaptureCount);
  const [sessionCount, setSessionCount] = useState(stats.sessionCount);
  const [totalInteractions, setTotalInteractions] = useState(stats.totalInteractions);
  const [avgDurationSeconds, setAvgDurationSeconds] = useState(stats.avgDurationSeconds);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleExport = (email: string) => {
    const url = `/api/admin/export-user-data?email=${encodeURIComponent(email)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (email: string) => {
    const captureCount = emailCaptures.filter(c => c.email === email).length;
    const sessionCountForEmail = sessions.filter(s => s.email === email).length;
    const confirmMsg = `Delete all data for ${email}?\n\nThis will permanently remove ${captureCount} email capture(s) and ${sessionCountForEmail} demo session(s).\n\nThis cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setDeletingEmail(email);
    setDeleteError(null);

    try {
      const res = await fetch(
        `/api/admin/delete-user-data?email=${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Delete failed');

      const remainingCaptures = emailCaptures.filter(c => c.email !== email);
      const deletedSessions = sessions.filter(s => s.email === email);
      const remainingSessions = sessions.filter(s => s.email !== email);
      const deletedInteractions = deletedSessions.reduce((sum, s) => sum + s.totalEvents, 0);
      const newAvg = remainingSessions.length > 0
        ? Math.round(remainingSessions.reduce((sum, s) => sum + s.durationSeconds, 0) / remainingSessions.length)
        : 0;

      setEmailCaptures(remainingCaptures);
      setSessions(remainingSessions);
      setEmailCaptureCount(prev => prev - 1);
      setSessionCount(prev => prev - deletedSessions.length);
      setTotalInteractions(prev => prev - deletedInteractions);
      setAvgDurationSeconds(newAvg);
    } catch {
      setDeleteError(`Failed to delete data for ${email}`);
    } finally {
      setDeletingEmail(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const maxEventCount = stats.eventTypeBreakdown[0]?.count ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Key metrics */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <StatCard icon="✉" label="Unique Emails" value={emailCaptureCount} />
        <StatCard icon="🖥" label="Demo Sessions" value={sessionCount} />
        <StatCard icon="⚡" label="Interactions" value={totalInteractions} />
        <StatCard icon="⏱" label="Avg Engagement" value={formatDuration(avgDurationSeconds)} />
      </div>

      {/* Two-column middle section */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Email Captures */}
        <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px', flex: '1 1 300px' }}>
          <div style={SECTION_HEADING}>Email Captures</div>

          {deleteError && (
            <p style={{ color: '#dc3545', fontSize: '0.8em', marginBottom: '10px' }}>{deleteError}</p>
          )}

          {emailCaptures.length === 0 ? (
            <p style={{ color: '#6c757d', fontSize: '0.85em' }}>No email captures yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {emailCaptures.map((capture) => (
                <div
                  key={capture.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: '#f8f9fa',
                    borderRadius: '6px',
                    fontSize: '0.82em',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#212529', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {capture.email}
                    </div>
                    <div style={{ color: '#6c757d', marginTop: '2px' }}>
                      via {capture.source} &middot; {formatDate(capture.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleExport(capture.email)}
                      aria-label={`Export data for ${capture.email}`}
                      title="Export GDPR data"
                      style={{
                        background: 'transparent',
                        border: '1px solid #6c757d',
                        color: '#6c757d',
                        padding: '3px 9px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9em',
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => handleDelete(capture.email)}
                      disabled={deletingEmail === capture.email}
                      aria-label={`Delete data for ${capture.email}`}
                      title="Delete all data for this email"
                      style={{
                        background: 'transparent',
                        border: '1px solid #dc3545',
                        color: deletingEmail === capture.email ? '#adb5bd' : '#dc3545',
                        padding: '3px 9px',
                        borderRadius: '4px',
                        cursor: deletingEmail === capture.email ? 'not-allowed' : 'pointer',
                        fontSize: '0.9em',
                      }}
                    >
                      {deletingEmail === capture.email ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Engagement Breakdown */}
        <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px', flex: '1 1 260px' }}>
          <div style={SECTION_HEADING}>Engagement Breakdown</div>
          <BarChart
            items={stats.eventTypeBreakdown.map(({ eventType, count }) => ({ label: eventType, count }))}
            maxValue={maxEventCount}
          />
        </div>
      </div>

      {/* Session table */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px' }}>
        <div style={SECTION_HEADING}>Recent Sessions</div>

        {sessions.length === 0 ? (
          <p style={{ color: '#6c757d', fontSize: '0.85em' }}>No demo sessions recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Started</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Duration</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Events</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.sessionId} style={{ borderBottom: '1px solid #f1f3f4' }}>
                    <td style={{ padding: '8px 12px', color: session.email ? '#212529' : '#adb5bd', fontStyle: session.email ? 'normal' : 'italic' }}>
                      {session.email ?? 'Anonymous'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#495057' }}>
                      {formatDate(session.startedAt)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#495057' }}>
                      {formatDuration(session.durationSeconds)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#495057' }}>
                      {session.totalEvents}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
