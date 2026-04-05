// ABOUT: Landing page analytics panel for the admin dashboard
// ABOUT: Stat cards, conversion metrics with dual rates, and bar-chart nav click breakdown

import type { LandingStats } from './types';
import { StatCard, BarChart, SECTION_HEADING } from './ui';

interface LandingAnalyticsProps {
  stats: LandingStats;
}

const conversionRate = (signups: number, base: number) => {
  if (base === 0) return '0%';
  return `${((signups / base) * 100).toFixed(1)}%`;
};

export default function LandingAnalytics({ stats }: LandingAnalyticsProps) {
  const maxNavClicks = stats.navClicks[0]?.count ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Key metrics */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <StatCard icon="👁" label="Total Visits" value={stats.totalVisits} />
        <StatCard icon="👤" label="Unique Visitors" value={stats.uniqueVisitors} />
        <StatCard icon="🔒" label="Privacy Page Views" value={stats.privacyPageViews} />
        <StatCard icon="🖥" label="Demo Sessions" value={stats.demoSessions} />
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
                  <span style={{ color: '#495057', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'bottom' }}>{source}</span>
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
