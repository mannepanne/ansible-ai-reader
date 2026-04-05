// ABOUT: Landing page analytics panel for the admin dashboard
// ABOUT: Displays visit counts, unique visitors, signup conversion, and nav clicks

import type { LandingStats } from './types';

interface LandingAnalyticsProps {
  stats: LandingStats;
}

const conversionRate = (signups: number, visits: number) => {
  if (visits === 0) return '0%';
  return `${((signups / visits) * 100).toFixed(1)}%`;
};

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

export default function LandingAnalytics({ stats }: LandingAnalyticsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Key metrics */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {statCard('Total Visits', stats.totalVisits)}
        {statCard('Unique Visitors', stats.uniqueVisitors)}
        {statCard('Demo Signups', stats.totalSignups)}
        {statCard('Conversion', conversionRate(stats.totalSignups, stats.totalVisits))}
      </div>

      {/* Signup source breakdown */}
      {stats.signupSources.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.9em', fontWeight: 600, color: '#495057', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Signup Sources
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Source</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {stats.signupSources.map(({ source, count }) => (
                <tr key={source} style={{ borderBottom: '1px solid #f1f3f4' }}>
                  <td style={{ padding: '8px 12px', color: '#212529' }}>{source}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#212529' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nav click breakdown */}
      {stats.navClicks.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.9em', fontWeight: 600, color: '#495057', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Navigation Clicks
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Section</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6c757d', fontWeight: 600 }}>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {stats.navClicks.map(({ label, count }) => (
                <tr key={label} style={{ borderBottom: '1px solid #f1f3f4' }}>
                  <td style={{ padding: '8px 12px', color: '#212529' }}>{label.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#212529' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stats.totalVisits === 0 && (
        <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No landing page visits recorded yet.</p>
      )}
    </div>
  );
}
