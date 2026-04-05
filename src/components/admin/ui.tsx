// ABOUT: Shared UI primitives for the admin analytics dashboard
// ABOUT: StatCard, BarChart, section heading styles, and duration formatter

import type { CSSProperties } from 'react';

export const SECTION_HEADING: CSSProperties = {
  fontSize: '0.8em',
  fontWeight: 600,
  color: '#495057',
  marginBottom: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const CARD: CSSProperties = {
  background: '#fff',
  border: '1px solid #dee2e6',
  borderRadius: '8px',
  padding: '18px 22px',
  flex: '1 1 150px',
};

export function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
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

export function BarChart({ items, maxValue }: { items: { label: string; count: number }[]; maxValue: number }) {
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

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
