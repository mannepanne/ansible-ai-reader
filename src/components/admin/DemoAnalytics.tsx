// ABOUT: Demo session analytics panel for the admin dashboard
// ABOUT: Shows session metrics, event breakdown, and per-user GDPR delete

'use client';

import { useState } from 'react';
import type { DemoStats, DemoSessionRow } from './types';

interface DemoAnalyticsProps {
  stats: DemoStats;
}

const statCard = (label: string, value: string | number) => (
  <div
    key={label}
    style={{
      background: '#fff',
      border: '1px solid #dee2e6',
      borderRadius: '6px',
      padding: '16px 20px',
      minWidth: '140px',
    }}
  >
    <div style={{ fontSize: '0.75em', color: '#6c757d', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </div>
    <div style={{ fontSize: '1.8em', fontWeight: 700, color: '#212529' }}>
      {value}
    </div>
  </div>
);

export default function DemoAnalytics({ stats }: DemoAnalyticsProps) {
  const [sessions, setSessions] = useState<DemoSessionRow[]>(stats.sessions);
  const [emailCaptureCount, setEmailCaptureCount] = useState(stats.emailCaptureCount);
  const [sessionCount, setSessionCount] = useState(stats.sessionCount);
  const [totalInteractions, setTotalInteractions] = useState(stats.totalInteractions);
  const [avgDurationMinutes, setAvgDurationMinutes] = useState(stats.avgDurationMinutes);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      const deletedRows = sessions.filter(s => s.email === email);
      const remainingRows = sessions.filter(s => s.email !== email);
      const deletedInteractions = deletedRows.reduce((sum, s) => sum + s.totalEvents, 0);
      const newAvg = remainingRows.length > 0
        ? Math.round(remainingRows.reduce((sum, s) => sum + s.durationMinutes, 0) / remainingRows.length)
        : 0;

      setSessions(remainingRows);
      setEmailCaptureCount(prev => prev - 1);
      setSessionCount(prev => prev - deletedRows.length);
      setTotalInteractions(prev => prev - deletedInteractions);
      setAvgDurationMinutes(newAvg);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Key metrics */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {statCard('Email Captures', emailCaptureCount)}
        {statCard('Demo Sessions', sessionCount)}
        {statCard('Interactions', totalInteractions)}
        {statCard('Avg Duration', `${avgDurationMinutes} min`)}
      </div>

      {/* Event type breakdown */}
      {stats.eventTypeBreakdown.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.9em', fontWeight: 600, color: '#495057', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Event Breakdown
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Event</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {stats.eventTypeBreakdown.map(({ eventType, count }) => (
                <tr key={eventType} style={{ borderBottom: '1px solid #f1f3f4' }}>
                  <td style={{ padding: '8px 12px', color: '#212529' }}>{eventType.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#212529' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Session table */}
      <div>
        <h3 style={{ fontSize: '0.9em', fontWeight: 600, color: '#495057', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recent Sessions
        </h3>

        {deleteError && (
          <p style={{ color: '#dc3545', fontSize: '0.85em', marginBottom: '8px' }}>{deleteError}</p>
        )}

        {sessions.length === 0 ? (
          <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No demo sessions recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Started</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Duration</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Events</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>GDPR</th>
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
                      {session.durationMinutes}m
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#495057' }}>
                      {session.totalEvents}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {session.email && (
                        <button
                          onClick={() => handleDelete(session.email!)}
                          disabled={deletingEmail === session.email}
                          aria-label={`Delete data for ${session.email}`}
                          style={{
                            background: 'transparent',
                            border: '1px solid #dc3545',
                            color: deletingEmail === session.email ? '#adb5bd' : '#dc3545',
                            padding: '3px 10px',
                            borderRadius: '4px',
                            cursor: deletingEmail === session.email ? 'not-allowed' : 'pointer',
                            fontSize: '0.8em',
                          }}
                        >
                          {deletingEmail === session.email ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
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
