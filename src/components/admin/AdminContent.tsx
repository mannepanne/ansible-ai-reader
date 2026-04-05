// ABOUT: Admin analytics dashboard client component
// ABOUT: Two-tab interface: Landing Page analytics and Demo session analytics

'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import LandingAnalytics from './LandingAnalytics';
import DemoAnalytics from './DemoAnalytics';
import type { LandingStats, DemoStats } from './types';

interface AdminContentProps {
  userEmail: string;
  landingStats: LandingStats;
  demoStats: DemoStats;
}

type Tab = 'landing' | 'demo';

export default function AdminContent({ userEmail, landingStats, demoStats }: AdminContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('landing');

  const tabStyle = (tab: Tab) => ({
    padding: '8px 20px',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #007bff' : '2px solid transparent',
    background: 'transparent',
    color: activeTab === tab ? '#007bff' : '#6c757d',
    fontWeight: activeTab === tab ? 600 : 400,
    fontSize: '0.9em',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      <Header userEmail={userEmail} isAdmin={true} />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '1.4em', fontWeight: 700, color: '#212529', marginBottom: '24px' }}>
          Analytics Dashboard
        </h1>

        {/* Tab bar */}
        <div style={{ borderBottom: '1px solid #dee2e6', marginBottom: '28px', display: 'flex', gap: '4px' }}>
          <button
            role="tab"
            aria-selected={activeTab === 'landing'}
            onClick={() => setActiveTab('landing')}
            style={tabStyle('landing')}
          >
            Landing Page
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'demo'}
            onClick={() => setActiveTab('demo')}
            style={tabStyle('demo')}
          >
            Demo
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'landing' && <LandingAnalytics stats={landingStats} />}
        {activeTab === 'demo' && <DemoAnalytics stats={demoStats} />}
      </div>
    </div>
  );
}
