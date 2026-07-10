// ABOUT: Admin "Relay Agent" tab — the human gate: read pieces by state and approve/reject them
// ABOUT: Reads are server-fetched (props); writes proxy to the bridge via /api/admin/relay/review

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { StatCard } from './ui';
import type { RelayStats, RelayPieceRow, RelayDecisionRow } from './types';

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
const excerpt = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n)}…` : s);
const LOG_PAGE_SIZE = 10;

// Only http(s) is safe in an href: an agent/web-supplied `javascript:` or `data:` URL would execute on
// click (these two link renders bypass ReactMarkdown's URL sanitiser). Anything else → href omitted, so
// the label still shows but the link is inert. href is the sole injection sink on this surface.
function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

// Grounding at a glance: 'sourced' = the piece cites a checkable research URL; 'unverified' = it does
// not (NOT a claim of falsehood). Honest labels — 'verified' is the deferred re-verification pass.
function VerificationBadge({ status }: { status: string }) {
  const sourced = status === 'sourced';
  return (
    <span
      title={sourced ? 'Cites at least one research source' : 'No research source cited'}
      style={{
        fontSize: '0.62em',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color: sourced ? '#0f5132' : '#6c757d',
        background: sourced ? '#d1e7dd' : '#e9ecef',
        borderRadius: '4px',
        padding: '2px 7px',
      }}
    >
      {sourced ? '● sourced' : '○ unverified'}
    </span>
  );
}

function titleOf(body: string): string {
  for (const line of body.split('\n')) {
    const m = line.match(/^#+\s+(.*\S)\s*$/);
    if (m) return m[1].trim();
  }
  return body.split('\n').map((l) => l.trim()).find(Boolean) ?? '(untitled)';
}

function bodyWithoutTitle(body: string): string {
  const lines = body.split('\n');
  const idx = lines.findIndex((l) => /^#+\s+\S/.test(l));
  if (idx === -1) return body;
  const rest = lines.slice(idx + 1);
  while (rest.length && rest[0].trim() === '') rest.shift();
  return rest.join('\n');
}

// A piece carries captured taste signal (Channel 2) if it has a reviewer note or was edited on approval.
// Used to badge/filter the approved + rejected lists so the periodic distillation pass can find them.
function hasSignal(p: RelayPieceRow): boolean {
  return Boolean(p.reviewNote || p.originalBody);
}

const signalCount = (pieces: RelayPieceRow[]): number => pieces.filter(hasSignal).length;

type View = 'log' | 'pending' | 'rejected' | 'approved';
type Action = 'approve' | 'reject';
type ReviewOpts = { note?: string; editedBody?: string };

export default function RelayAgent({ stats }: { stats: RelayStats }) {
  const router = useRouter();
  const [view, setView] = useState<View>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, action: Action, opts?: ReviewOpts) {
    setBusyId(id);
    setError(null);
    try {
      const note = opts?.note?.trim();
      const res = await fetch('/api/admin/relay/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          action,
          ...(note ? { note } : {}),
          // edited_body only rides along on approve, and only when it actually differs (the backend
          // also guards this, but sending nothing on a no-op keeps the request honest).
          ...(action === 'approve' && opts?.editedBody !== undefined ? { edited_body: opts.editedBody } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(data.detail || data.error || `${action} failed (${res.status})`);
      }
      // Re-fetch authoritative server state so the piece moves to the right list and counts update.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const subTabStyle = (v: View) => ({
    padding: '8px 18px',
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
      <RunControl />

      {/* Widgets: decision verdicts (declined/wrote) then gate states (pending/rejected/approved) */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <StatCard icon="🔇" label="Declined" value={stats.counts.declined} />
        <StatCard icon="✍️" label="Wrote" value={stats.counts.wrote} />
        <StatCard icon="📥" label="Pending" value={stats.counts.pendingReview} />
        <StatCard icon="🗑️" label="Rejected" value={stats.counts.rejected} />
        <StatCard icon="✅" label="Approved" value={stats.counts.approved} />
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

      <div style={{ borderBottom: '1px solid #dee2e6', marginBottom: '24px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <button role="tab" aria-selected={view === 'log'} onClick={() => setView('log')} style={subTabStyle('log')}>
          Decision log
        </button>
        <button role="tab" aria-selected={view === 'pending'} onClick={() => setView('pending')} style={subTabStyle('pending')}>
          Awaiting review{stats.pending.length > 0 ? ` (${stats.pending.length})` : ''}
        </button>
        <button role="tab" aria-selected={view === 'rejected'} onClick={() => setView('rejected')} style={subTabStyle('rejected')}>
          Rejected{signalCount(stats.rejected) > 0 ? ` · ✎${signalCount(stats.rejected)}` : ''}
        </button>
        <button role="tab" aria-selected={view === 'approved'} onClick={() => setView('approved')} style={subTabStyle('approved')}>
          Approved{signalCount(stats.approved) > 0 ? ` · ✎${signalCount(stats.approved)}` : ''}
        </button>
      </div>

      {view === 'log' && <LogPanel decisions={stats.decisions} />}
      {view === 'pending' && <PieceList pieces={stats.pending} actions={['approve', 'reject']} busyId={busyId} onReview={review} empty="No pieces awaiting review." />}
      {view === 'rejected' && <PieceList pieces={stats.rejected} actions={['approve']} busyId={busyId} onReview={review} empty="No rejected pieces." filterable />}
      {view === 'approved' && <PieceList pieces={stats.approved} actions={['reject']} busyId={busyId} onReview={review} empty="No approved pieces." filterable />}
    </div>
  );
}

function RunControl() {
  const [readerId, setReaderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    const id = readerId.trim();
    if (!id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/relay/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ readerId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string };
      if (!res.ok) throw new Error(data.error || `run failed (${res.status})`);
      setMsg({
        ok: true,
        text: `Session queued${data.title ? ` for “${data.title}”` : ''} — the verdict will appear in the Decision log in a few minutes.`,
      });
      setReaderId('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="relay-reader-id" style={{ fontSize: '0.8em', fontWeight: 600, color: '#495057' }}>
          Run a session
        </label>
        <input
          id="relay-reader-id"
          value={readerId}
          onChange={(e) => setReaderId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
          }}
          placeholder="reader_id"
          style={{ padding: '7px 10px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '0.85em', minWidth: '280px' }}
        />
        <button
          onClick={run}
          disabled={busy || !readerId.trim()}
          style={{
            padding: '7px 16px',
            border: 'none',
            borderRadius: '6px',
            background: '#0d6efd',
            color: '#fff',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy || !readerId.trim() ? 0.6 : 1,
          }}
        >
          {busy ? '…' : 'Run'}
        </button>
      </div>
      {msg && (
        <div role="status" style={{ marginTop: '10px', fontSize: '0.82em', color: msg.ok ? '#0f5132' : '#842029' }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

function PieceList({
  pieces,
  actions,
  busyId,
  onReview,
  empty,
  filterable = false,
}: {
  pieces: RelayPieceRow[];
  actions: Action[];
  busyId: string | null;
  onReview: (id: string, action: Action, opts?: ReviewOpts) => void;
  empty: string;
  filterable?: boolean;
}) {
  // On the decided lists, let Magnus collapse to just the pieces carrying taste signal — the findability
  // the periodic distillation pass needs (spec §F). Pending has no signal yet, so no filter there.
  const [onlySignal, setOnlySignal] = useState(false);
  const withSignal = signalCount(pieces);
  const shown = filterable && onlySignal ? pieces.filter(hasSignal) : pieces;

  if (pieces.length === 0) {
    return <p style={{ color: '#6c757d', fontSize: '0.9em' }}>{empty}</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {filterable && withSignal > 0 && (
        <label style={{ fontSize: '0.8em', color: '#495057', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <input type="checkbox" checked={onlySignal} onChange={(e) => setOnlySignal(e.target.checked)} />
          Show only noted / edited pieces (✎{withSignal})
        </label>
      )}
      {shown.map((p) => (
        <PieceCard key={p.id} piece={p} actions={actions} busyId={busyId} onReview={onReview} />
      ))}
    </div>
  );
}

function PieceCard({
  piece,
  actions,
  busyId,
  onReview,
}: {
  piece: RelayPieceRow;
  actions: Action[];
  busyId: string | null;
  onReview: (id: string, action: Action, opts?: ReviewOpts) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(piece.body);
  const busy = busyId === piece.id;
  const indent = { marginLeft: '26px' };
  const canEdit = actions.includes('approve'); // an edit only rides along on approval
  const edited = editing && draft.trim() !== piece.body.trim() ? draft : undefined;

  return (
    <article style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand'}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85em', color: '#6c757d', padding: 0, width: '18px' }}
        >
          {open ? '▾' : '▸'}
        </button>
        <h3 style={{ margin: 0, fontSize: '1.02em', fontWeight: 700, color: '#212529' }}>{titleOf(piece.body)}</h3>
        <VerificationBadge status={piece.verificationStatus} />
        {hasSignal(piece) && (
          <span
            title={piece.originalBody ? 'Edited on approval; has a note' : 'Has a reviewer note'}
            style={{ fontSize: '0.62em', fontWeight: 700, color: '#664d03', background: '#fff3cd', borderRadius: '4px', padding: '2px 7px' }}
          >
            ✎ {piece.originalBody ? 'edited' : 'noted'}
          </span>
        )}
      </div>

      {piece.summary && <p style={{ fontStyle: 'italic', color: '#495057', margin: '8px 0 8px 0', ...indent }}>{piece.summary}</p>}
      <div style={{ fontSize: '0.72em', color: '#6c757d', margin: '0 0 0 0', ...indent }}>
        {fmt(piece.createdAt)} UTC · recalled {piece.recalledCount}
        {piece.concepts.length > 0 ? ` · ${piece.concepts.join(' · ')}` : ''}
      </div>

      {piece.sourceLinks.length > 0 && (
        <div style={{ fontSize: '0.75em', color: '#495057', marginTop: '8px', ...indent }}>
          <span style={{ color: '#6c757d' }}>sources:</span>{' '}
          {piece.sourceLinks.map((l, i) => (
            <span key={`${l.ref}-${i}`}>
              {i > 0 ? ' · ' : ''}
              <a href={safeHref(l.ref)} target="_blank" rel="noreferrer noopener" style={{ color: '#0d6efd' }}>
                {l.title || l.ref}
              </a>
            </span>
          ))}
        </div>
      )}

      {piece.readerLinks.length > 0 && (
        <div style={{ fontSize: '0.75em', color: '#495057', marginTop: '8px', ...indent }}>
          <span style={{ color: '#6c757d' }}>in Reader:</span>{' '}
          {piece.readerLinks.map((l, i) => (
            <span key={`${l.readerId}-${i}`}>
              {i > 0 ? ' · ' : ''}
              <a href={safeHref(l.url)} target="_blank" rel="noreferrer noopener" style={{ color: '#0d6efd' }}>
                {l.title}
              </a>
            </span>
          ))}
        </div>
      )}

      {/* The stimulus is RECONSTRUCTED with today's assembler, not the text actually sent — a piece
          written before an assembler change (e.g. pre-2.3a Tags/Note) renders lines it never saw. The
          label says "reconstructed" so it stays an honest instrument, not a false record. */}
      {piece.stimulus && (
        <details style={{ marginTop: '8px', ...indent }}>
          <summary style={{ cursor: 'pointer', color: '#6c757d', fontSize: '0.75em' }}>
            stimulus — reconstructed (current logic)
          </summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.78em',
              color: '#495057',
              background: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '6px',
              padding: '10px 12px',
              marginTop: '6px',
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.5,
            }}
          >
            {piece.stimulus}
          </pre>
        </details>
      )}

      {/* Captured taste signal (Channel 2), shown to Magnus only — never to a writing session. */}
      {piece.reviewNote && (
        <div style={{ fontSize: '0.8em', color: '#664d03', background: '#fffbea', border: '1px solid #ffe69c', borderRadius: '6px', padding: '7px 10px', marginTop: '10px', ...indent }}>
          <span style={{ color: '#997404', fontWeight: 600 }}>note:</span> {piece.reviewNote}
        </div>
      )}

      {open && (
        <div style={{ fontSize: '0.92em', lineHeight: 1.6, color: '#212529', marginTop: '12px', ...indent }}>
          <ReactMarkdown>{bodyWithoutTitle(piece.body)}</ReactMarkdown>
          {piece.originalBody && (
            <details style={{ marginTop: '12px', fontSize: '0.92em' }}>
              <summary style={{ cursor: 'pointer', color: '#997404', fontSize: '0.86em' }}>
                original — before your edit
              </summary>
              <div style={{ opacity: 0.75, marginTop: '8px', borderLeft: '3px solid #ffe69c', paddingLeft: '12px' }}>
                <ReactMarkdown>{bodyWithoutTitle(piece.originalBody)}</ReactMarkdown>
              </div>
            </details>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ marginTop: '14px', ...indent }}>
          {canEdit && editing && (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit piece body"
              rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '0.86em', fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, marginBottom: '10px', boxSizing: 'border-box' }}
            />
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Review note"
            placeholder={actions.includes('reject') ? 'Why? (a note — the reject reason, or a note on approval)' : 'A note (optional)'}
            rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '0.84em', lineHeight: 1.5, marginBottom: '10px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {actions.includes('approve') && (
              <button
                onClick={() => onReview(piece.id, 'approve', { note, editedBody: edited })}
                disabled={busy}
                style={{ padding: '7px 16px', border: 'none', borderRadius: '6px', background: '#198754', color: '#fff', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? '…' : edited ? 'Approve with edit' : 'Approve'}
              </button>
            )}
            {actions.includes('reject') && (
              <button
                onClick={() => onReview(piece.id, 'reject', { note })}
                disabled={busy}
                style={{ padding: '7px 16px', border: '1px solid #dc3545', borderRadius: '6px', background: '#fff', color: '#dc3545', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? '…' : 'Reject'}
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => {
                  setDraft(piece.body);
                  setEditing((v) => !v);
                }}
                disabled={busy}
                style={{ padding: '7px 14px', border: '1px solid #ced4da', borderRadius: '6px', background: '#fff', color: '#495057', fontSize: '0.85em', cursor: 'pointer' }}
              >
                {editing ? 'Cancel edit' : 'Edit'}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function LogPanel({ decisions }: { decisions: RelayDecisionRow[] }) {
  const [page, setPage] = useState(0);
  if (decisions.length === 0) {
    return <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No decisions yet.</p>;
  }
  const pageCount = Math.ceil(decisions.length / LOG_PAGE_SIZE);
  const current = Math.min(page, pageCount - 1);
  const slice = decisions.slice(current * LOG_PAGE_SIZE, current * LOG_PAGE_SIZE + LOG_PAGE_SIZE);
  const btn = (disabled: boolean) => ({
    padding: '6px 14px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    background: '#fff',
    color: disabled ? '#adb5bd' : '#495057',
    fontSize: '0.82em',
    cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {slice.map((d, i) => {
        const wrote = d.verdict === 'wrote';
        const material = d.stimulusTitles.length > 0 ? d.stimulusTitles.join('; ') : d.stimulusRef.join(', ') || '(unknown stimulus)';
        return (
          <article key={current * LOG_PAGE_SIZE + i} style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '14px 18px' }}>
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
            {d.sources.length > 0 && (
              <div style={{ fontSize: '0.75em', color: '#495057', marginTop: '6px' }}>
                <span style={{ color: '#6c757d' }}>researched:</span>{' '}
                {d.sources.map((s, si) => (
                  <span key={`${s.source_url}-${si}`}>
                    {si > 0 ? ' · ' : ''}
                    <a href={safeHref(s.source_url)} target="_blank" rel="noreferrer noopener" style={{ color: '#0d6efd' }}>
                      {s.source_title || s.source_url}
                    </a>
                  </span>
                ))}
              </div>
            )}
          </article>
        );
      })}
      </div>
      {pageCount > 1 && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '18px' }}>
          <button disabled={current === 0} onClick={() => setPage(current - 1)} style={btn(current === 0)}>
            ← Prev
          </button>
          <span style={{ fontSize: '0.8em', color: '#6c757d' }}>
            Page {current + 1} of {pageCount} · {decisions.length} decisions
          </span>
          <button disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} style={btn(current >= pageCount - 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
