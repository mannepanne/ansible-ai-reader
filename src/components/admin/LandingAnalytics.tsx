// ABOUT: Landing page analytics panel for the admin dashboard
// ABOUT: Stat cards, conversion metrics, and bar-chart breakdowns for nav clicks

import type { LandingStats } from './types';

interface LandingAnalyticsProps {
  stats: LandingStats;
}

const conversionRate = (signups: number, base: number) => {
  if (base === 0) return '0%';
  return `${((signups / base) * 100).toFixed(1)}%`;
};

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

export default function LandingAnalytics({ stats }: LandingAnalyticsProps) {
  const maxNavClicks = stats.navClicks[0]?.count ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Key metrics */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <StatCard icon="👁" label="Total Visits" value={stats.totalVisits} />
        <StatCard icon="👤" label="Unique Visitors" value={stats.uniqueVisitors} />
        <StatCard icon="🔒" label="Privacy Page Views" value={stats.privacyPageViews} />
        <StatCard icon="🖥" label="Total Sessions" value={stats.totalSessions} />
      </div>

      {/* Conversion */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px' }}>
        <div style={SECTION_HEADING}>Conversion</div>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: stats.signupSources.length > 0 ? '20px' : 0 }}>
          <div>
            <div style={{ fontSize: '2.2em', fontWeight: 700, color: '#007bff', lineHeight: 1 }}>
              {conversionRate(stats.totalSignups, stats.totalVisits)}
            </div>
            <div style={{ fontSize: '0.8em', color: '#6c757d', marginTop: '4px' }}>
              {stats.totalSignups} signups from {stats.totalVisits} visits
            </div>
          </div>
          <div style={{ width: '1px', background: '#dee2e6', alignSelf: 'stretch' }} />
          <div>
            <div style={{ fontSize: '2.2em', fontWeight: 700, color: '#28a745', lineHeight: 1 }}>
              {conversionRate(stats.totalSignups, stats.uniqueVisitors)}
            </div>
            <div style={{ fontSize: '0.8em', color: '#6c757d', marginTop: '4px' }}>
              {stats.totalSignups} signups from {stats.uniqueVisitors} unique visitors
            </div>
          </div>
        </div>

        {stats.signupSources.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid #f1f3f4', margin: '16px 0' }} />
            <div style={SECTION_HEADING}>Signup sources</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {stats.signupSources.map(({ source, count }) => (
                <div key={source} style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px', padding: '8px 14px', fontSize: '0.85em' }}>
                  <span style={{ color: '#495057' }}>{source}</span>
                  <span style={{ color: '#007bff', fontWeight: 700, marginLeft: '8px' }}>{count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Navigation Clicks */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px 24px' }}>
        <div style={SECTION_HEADING}>Navigation Clicks</div>
        <BarChart items={stats.navClicks} maxValue={maxNavClicks} />
      </div>

      {stats.totalVisits === 0 && (
        <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No landing page visits recorded yet.</p>
      )}
    </div>
  );
}
