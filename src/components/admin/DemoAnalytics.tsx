// ABOUT: Demo session analytics panel for the admin dashboard
// ABOUT: Shows session metrics, engagement bar charts, email captures with GDPR actions, and session table

'use client';

import { useState } from 'react';
import type { DemoStats, DemoSessionRow, EmailCaptureRow } from './types';

interface DemoAnalyticsProps {
  stats: DemoStats;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const SECTION_HEADING: React.CSSProperties = {
  fontSize: '0.8em',
  fontWeight: 600,
  color: '#495057',
  marginBottom: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dee2e6',
  borderRadius: '8px',
  padding: '18px 22px',
  flex: '1 1 150px',
};

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1em' }}>{icon}</span>
        <span style={{ fontSize: '0.72em', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '2em', fontWeight: 700, color: '#212529', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function BarChart({ items, maxValue }: { items: { label: string; count: number }[]; maxValue: number }) {
  if (items.length === 0) return <p style={{ color: '#6c757d', fontSize: '0.85em' }}>No data yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map(({ label, count }) => {
        const pct = maxValue > 0 ? Math.round((count / maxValue) * 100) : 0;
        return (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85em' }}>
              <span style={{ color: '#495057' }}>{label.replace(/_/g, ' ')}</span>
              <span style={{ color: '#212529', fontWeight: 600 }}>{count}</span>
            </div>
            <div style={{ background: '#e9ecef', borderRadius: '4px', height: '8px' }}>
              <div style={{ background: '#007bff', width: `${pct}%`, height: '8px', borderRadius: '4px', transition: 'width 0.3s' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
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
    if (!confirm(`Delete all data for ${email}? This cannot be undone.`)) return;

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
        <StatCard icon="✉" label="Email Signups" value={emailCaptureCount} />
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
