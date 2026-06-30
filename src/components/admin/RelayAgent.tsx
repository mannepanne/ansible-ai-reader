// ABOUT: Admin "Relay Agent" tab — the human gate: read pending pieces and approve/reject them
// ABOUT: Reads are server-fetched (props); writes proxy to the bridge via /api/admin/relay/review

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { StatCard } from './ui';
import type { RelayStats, RelayPieceRow, RelayDecisionRow } from './types';

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
const excerpt = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n)}…` : s);

type View = 'review' | 'log';

export default function RelayAgent({ stats }: { stats: RelayStats }) {
  const [view, setView] = useState<View>('review');
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
      // Drop the decided piece and adjust gate-state counts (verdict counts are immutable history).
      setPending((prev) => prev.filter((p) => p.id !== id));
      setCounts((c) => ({
        ...c,
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

  const subTabStyle = (v: View) => ({
    padding: '8px 20px',
    border: 'none',
    borderBottom: view === v ? '2px solid #007bff' : '2px solid transparent',
    background: 'transparent',
    color: view === v ? '#007bff' : '#6c757d',
    fontWeight: view === v ? 600 : 400,
    fontSize: '0.9em',
    cursor: 'pointer',
  });

  return (
    <div>
      {/* Widgets: decision verdicts (declined/wrote) then gate states (pending/rejected/approved) */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <StatCard icon="🔇" label="Declined" value={counts.declined} />
        <StatCard icon="✍️" label="Wrote" value={counts.wrote} />
        <StatCard icon="📥" label="Pending" value={counts.pendingReview} />
        <StatCard icon="🗑️" label="Rejected" value={counts.rejected} />
        <StatCard icon="✅" label="Approved" value={counts.approved} />
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

      {/* Sub-tabs */}
      <div style={{ borderBottom: '1px solid #dee2e6', marginBottom: '24px', display: 'flex', gap: '4px' }}>
        <button role="tab" aria-selected={view === 'review'} onClick={() => setView('review')} style={subTabStyle('review')}>
          Awaiting review{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button role="tab" aria-selected={view === 'log'} onClick={() => setView('log')} style={subTabStyle('log')}>
          Decision log
        </button>
      </div>

      {view === 'review' ? <ReviewPanel pending={pending} busyId={busyId} onReview={review} /> : <LogPanel decisions={stats.decisions} />}
    </div>
  );
}

function ReviewPanel({
  pending,
  busyId,
  onReview,
}: {
  pending: RelayPieceRow[];
  busyId: string | null;
  onReview: (id: string, action: 'approve' | 'reject') => void;
}) {
  if (pending.length === 0) {
    return <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No pieces awaiting review.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {pending.map((p) => (
        <article key={p.id} style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px' }}>
          {p.summary && <p style={{ fontStyle: 'italic', color: '#495057', marginTop: 0, marginBottom: '12px' }}>{p.summary}</p>}
          <div style={{ fontSize: '0.72em', color: '#6c757d', marginBottom: '14px' }}>
            {fmt(p.createdAt)} UTC · recalled {p.recalledCount}
            {p.concepts.length > 0 ? ` · ${p.concepts.join(' · ')}` : ''}
          </div>
          <div style={{ fontSize: '0.92em', lineHeight: 1.6, color: '#212529' }}>
            <ReactMarkdown>{p.body}</ReactMarkdown>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button
              onClick={() => onReview(p.id, 'approve')}
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
              onClick={() => onReview(p.id, 'reject')}
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
  );
}

function LogPanel({ decisions }: { decisions: RelayDecisionRow[] }) {
  if (decisions.length === 0) {
    return <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No decisions yet.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {decisions.map((d, i) => {
        const wrote = d.verdict === 'wrote';
        const material = d.stimulusTitles.length > 0 ? d.stimulusTitles.join('; ') : d.stimulusRef.join(', ') || '(unknown stimulus)';
        return (
          <article key={i} style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.72em', color: '#6c757d', whiteSpace: 'nowrap' }}>{fmt(d.createdAt)}</span>
              <span style={{ fontWeight: 700, fontSize: '0.72em', color: wrote ? '#198754' : '#6c757d', textTransform: 'uppercase' }}>
                {d.verdict}
              </span>
              {d.degraded && (
                <span style={{ fontSize: '0.68em', color: '#9a6700', background: '#fff3cd', borderRadius: '4px', padding: '1px 6px' }}>
                  degraded: {d.degraded}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.85em', color: '#212529', marginBottom: wrote || d.reason ? '6px' : 0 }}>
              <span style={{ color: '#6c757d' }}>on:</span> {material}
            </div>
            {wrote && d.pieceSummary && (
              <div style={{ fontSize: '0.85em', color: '#495057', marginBottom: d.reason ? '6px' : 0 }}>
                <span style={{ color: '#6c757d' }}>wrote:</span> {d.pieceSummary}
              </div>
            )}
            {d.reason && (
              <div style={{ fontSize: '0.82em', color: '#495057', fontStyle: 'italic', lineHeight: 1.5 }}>
                <span style={{ color: '#6c757d', fontStyle: 'normal' }}>reasoning:</span> {excerpt(d.reason)}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
