// ABOUT: Admin "Relay Agent" tab — the human gate: read pending pieces and approve/reject them
// ABOUT: Reads are server-fetched (props); writes proxy to the bridge via /api/admin/relay/review

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { StatCard, SECTION_HEADING } from './ui';
import type { RelayStats, RelayPieceRow } from './types';

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');

export default function RelayAgent({ stats }: { stats: RelayStats }) {
  const [pending, setPending] = useState<RelayPieceRow[]>(stats.pending);
  const [counts, setCounts] = useState(stats.counts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/relay/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(data.detail || data.error || `${action} failed (${res.status})`);
      }
      // Drop the decided piece from the pending list and adjust the counts.
      setPending((prev) => prev.filter((p) => p.id !== id));
      setCounts((c) => ({
        pendingReview: Math.max(0, c.pendingReview - 1),
        approved: action === 'approve' ? c.approved + 1 : c.approved,
        rejected: action === 'reject' ? c.rejected + 1 : c.rejected,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <StatCard icon="📥" label="Pending review" value={counts.pendingReview} />
        <StatCard icon="✅" label="Approved" value={counts.approved} />
        <StatCard icon="🗑️" label="Rejected" value={counts.rejected} />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: '#f8d7da',
            color: '#842029',
            border: '1px solid #f5c2c7',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '18px',
            fontSize: '0.85em',
          }}
        >
          {error}
        </div>
      )}

      <h2 style={SECTION_HEADING}>Awaiting review</h2>
      {pending.length === 0 ? (
        <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No pieces awaiting review.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '36px' }}>
          {pending.map((p) => (
            <article key={p.id} style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px' }}>
              {p.summary && (
                <p style={{ fontStyle: 'italic', color: '#495057', marginTop: 0, marginBottom: '12px' }}>{p.summary}</p>
              )}
              <div style={{ fontSize: '0.72em', color: '#6c757d', marginBottom: '14px' }}>
                {fmt(p.createdAt)} UTC · recalled {p.recalledCount}
                {p.concepts.length > 0 ? ` · ${p.concepts.join(' · ')}` : ''}
              </div>
              <div style={{ fontSize: '0.92em', lineHeight: 1.6, color: '#212529' }}>
                <ReactMarkdown>{p.body}</ReactMarkdown>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                <button
                  onClick={() => review(p.id, 'approve')}
                  disabled={busyId === p.id}
                  style={{
                    padding: '8px 18px',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#198754',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: busyId === p.id ? 'wait' : 'pointer',
                    opacity: busyId === p.id ? 0.6 : 1,
                  }}
                >
                  {busyId === p.id ? '…' : 'Approve'}
                </button>
                <button
                  onClick={() => review(p.id, 'reject')}
                  disabled={busyId === p.id}
                  style={{
                    padding: '8px 18px',
                    border: '1px solid #dc3545',
                    borderRadius: '6px',
                    background: '#fff',
                    color: '#dc3545',
                    fontWeight: 600,
                    cursor: busyId === p.id ? 'wait' : 'pointer',
                    opacity: busyId === p.id ? 0.6 : 1,
                  }}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 style={SECTION_HEADING}>Decision log</h2>
      {stats.decisions.length === 0 ? (
        <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No decisions yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stats.decisions.map((d, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '12px',
                fontSize: '0.82em',
                alignItems: 'baseline',
                borderBottom: '1px solid #f1f3f5',
                paddingBottom: '6px',
              }}
            >
              <span style={{ color: '#6c757d', whiteSpace: 'nowrap' }}>{fmt(d.createdAt)}</span>
              <span
                style={{
                  fontWeight: 600,
                  color: d.verdict === 'wrote' ? '#198754' : '#6c757d',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.verdict}
              </span>
              <span style={{ color: '#495057' }}>
                {d.stimulusRef.join(', ')}
                {d.degraded ? ` · degraded:${d.degraded}` : ''}
                {d.verdict === 'declined' && d.reason ? ` — ${d.reason.slice(0, 160)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
