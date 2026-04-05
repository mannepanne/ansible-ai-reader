// ABOUT: Tests for LandingAnalytics component and shared ui.tsx utilities
// ABOUT: Covers stat cards, dual conversion rates, bar charts, empty states, and formatDuration

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingAnalytics from './LandingAnalytics';
import { formatDuration } from './ui';
import type { LandingStats } from './types';

const mockStats: LandingStats = {
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

const emptyStats: LandingStats = {
  totalVisits: 0,
  uniqueVisitors: 0,
  privacyPageViews: 0,
  demoSessions: 0,
  totalSignups: 0,
  navClicks: [],
  signupSources: [],
};

describe('LandingAnalytics', () => {
  it('renders all four stat cards', () => {
    render(<LandingAnalytics stats={mockStats} />);
    expect(screen.getByText('120')).toBeDefined(); // totalVisits
    expect(screen.getByText('85')).toBeDefined();  // uniqueVisitors
    expect(screen.getByText('18')).toBeDefined();  // privacyPageViews
    expect(screen.getByText('22')).toBeDefined();  // demoSessions
  });

  it('renders dual conversion rates', () => {
    render(<LandingAnalytics stats={mockStats} />);
    // 15/120 = 12.5% and 15/85 = 17.6%
    expect(screen.getByText('12.5%')).toBeDefined();
    expect(screen.getByText('17.6%')).toBeDefined();
  });

  it('renders conversion context text', () => {
    render(<LandingAnalytics stats={mockStats} />);
    expect(screen.getByText(/15 signups from 120 visits/)).toBeDefined();
    expect(screen.getByText(/15 signups from 85 unique visitors/)).toBeDefined();
  });

  it('renders signup source badges', () => {
    render(<LandingAnalytics stats={mockStats} />);
    expect(screen.getByText('hero')).toBeDefined();
    expect(screen.getByText('cta')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });

  it('renders navigation clicks as bar chart items', () => {
    render(<LandingAnalytics stats={mockStats} />);
    expect(screen.getByText('features')).toBeDefined();
    expect(screen.getByText('how it works')).toBeDefined(); // underscores replaced
    expect(screen.getByText('40')).toBeDefined();
    expect(screen.getByText('30')).toBeDefined();
  });

  it('shows zero state message when no visits', () => {
    render(<LandingAnalytics stats={emptyStats} />);
    expect(screen.getByText(/No landing page visits recorded yet/)).toBeDefined();
  });

  it('shows "No data yet" in nav clicks bar chart when empty', () => {
    render(<LandingAnalytics stats={emptyStats} />);
    expect(screen.getByText('No data yet.')).toBeDefined();
  });

  it('shows 0% conversion when no visits', () => {
    render(<LandingAnalytics stats={emptyStats} />);
    expect(screen.getAllByText('0%').length).toBe(2); // both conversion rates
  });

  it('does not render signup sources section when empty', () => {
    render(<LandingAnalytics stats={{ ...mockStats, signupSources: [] }} />);
    expect(screen.queryByText('hero')).toBeNull();
    expect(screen.queryByText('Signup sources')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('returns "0s" for zero seconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('returns "0s" for negative seconds', () => {
    expect(formatDuration(-10)).toBe('0s');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(1)).toBe('1s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1m 0s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(185)).toBe('3m 5s');
    expect(formatDuration(3599)).toBe('59m 59s');
  });

  it('formats hours and minutes (drops seconds for long durations)', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7384)).toBe('2h 3m');
  });
});
