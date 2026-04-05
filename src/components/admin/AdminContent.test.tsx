// ABOUT: Tests for the admin analytics dashboard client component
// ABOUT: Validates tab rendering, metrics display, and session table

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminContent from './AdminContent';
import type { LandingStats, DemoStats } from './types';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Header
vi.mock('@/components/Header', () => ({
  default: ({ userEmail }: { userEmail: string }) => (
    <header data-testid="header">Header: {userEmail}</header>
  ),
}));

const mockLandingStats: LandingStats = {
  totalVisits: 120,
  uniqueVisitors: 85,
  privacyPageViews: 18,
  demoSessions: 22,
  totalSignups: 15,
  navClicks: [
    { label: 'features', count: 40 },
    { label: 'how_it_works', count: 30 },
  ],
  signupSources: [
    { source: 'hero', count: 10 },
    { source: 'cta', count: 5 },
  ],
};

const mockDemoStats: DemoStats = {
  emailCaptureCount: 15,
  sessionCount: 22,
  totalInteractions: 187,
  avgDurationSeconds: 240,
  eventTypeBreakdown: [
    { eventType: 'tab_switch', count: 55 },
    { eventType: 'expand', count: 42 },
    { eventType: 'archive', count: 12 },
  ],
  emailCaptures: [
    { id: 'cap-1', email: 'user@example.com', source: 'hero', createdAt: '2026-04-01T09:00:00Z' },
  ],
  sessions: [
    {
      sessionId: 'sess-1',
      email: 'user@example.com',
      startedAt: '2026-04-01T10:00:00Z',
      durationSeconds: 300,
      totalEvents: 12,
    },
    {
      sessionId: 'sess-2',
      email: null,
      startedAt: '2026-04-02T14:00:00Z',
      durationSeconds: 120,
      totalEvents: 4,
    },
  ],
};

describe('AdminContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header with user email', () => {
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );
    expect(screen.getByTestId('header')).toBeDefined();
  });

  it('renders both Landing Page and Demo tabs', () => {
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );
    expect(screen.getByRole('tab', { name: /landing page/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /demo/i })).toBeDefined();
  });

  it('shows landing page metrics by default', () => {
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );
    expect(screen.getByText('120')).toBeDefined();  // totalVisits
    expect(screen.getByText('85')).toBeDefined();   // uniqueVisitors
    expect(screen.getByText('18')).toBeDefined();   // privacyPageViews
  });

  it('shows conversion rate on landing tab', () => {
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );
    // 15/120 = 12.5%
    expect(screen.getByText(/12\.5%/)).toBeDefined();
  });

  it('switches to demo tab and shows demo metrics', async () => {
    const user = userEvent.setup();
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );

    await user.click(screen.getByRole('tab', { name: /^demo$/i }));

    expect(screen.getByText('22')).toBeDefined();  // sessionCount
    expect(screen.getByText('187')).toBeDefined(); // totalInteractions
    expect(screen.getByText('4m 0s')).toBeDefined(); // avgDurationSeconds: 240s formatted
  });

  it('shows session table with email and anonymous entries', async () => {
    const user = userEvent.setup();
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );

    await user.click(screen.getByRole('tab', { name: /^demo$/i }));

    // email appears in both captures list and session table
    expect(screen.getAllByText('user@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Anonymous')).toBeDefined();
  });

  it('shows delete and export buttons in email captures section', async () => {
    const user = userEvent.setup();
    render(
      <AdminContent
        userEmail="admin@example.com"
        landingStats={mockLandingStats}
        demoStats={mockDemoStats}
      />
    );

    await user.click(screen.getByRole('tab', { name: /^demo$/i }));

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    const exportButtons = screen.getAllByRole('button', { name: /export/i });
    // mockDemoStats has 1 email capture row → 1 of each
    expect(deleteButtons.length).toBe(1);
    expect(exportButtons.length).toBe(1);
  });
});
