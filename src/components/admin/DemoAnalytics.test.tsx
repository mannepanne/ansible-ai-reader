// ABOUT: Tests for DemoAnalytics component
// ABOUT: Validates stat card rendering, email captures list, session table, and stat decrement after GDPR delete

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoAnalytics from './DemoAnalytics';
import type { DemoStats } from './types';

global.fetch = vi.fn();

// Values chosen to be globally unique across all rendered elements at every test state
// Initial: stat cards → 7, 13, 42, "4m 23s"
// Sessions: 360s→"6m 0s"(11 events), 240s→"4m 0s"(8 events), 180s→"3m 0s"(17 events), 270s→"4m 30s"(9 events)
// After alice deleted: stat cards → 6, 11, 23, "3m 45s"; sessions: "3m 0s"(17), "4m 30s"(9)
// avg after delete = (180+270)/2 = 225s = "3m 45s" — unique, no collision with session table values
const mockStats: DemoStats = {
  emailCaptureCount: 7,
  sessionCount: 13,
  totalInteractions: 42,
  avgDurationSeconds: 263,  // Math.round((360+240+180+270)/4) = 263s → "4m 23s"
  eventTypeBreakdown: [{ eventType: 'tab_switch', count: 20 }],
  emailCaptures: [
    { id: 'cap-1', email: 'alice@example.com', source: 'hero', createdAt: '2026-04-01T09:00:00Z' },
    { id: 'cap-2', email: 'alice@example.com', source: 'cta', createdAt: '2026-04-01T10:00:00Z' },
  ],
  sessions: [
    { sessionId: 'sess-1', email: 'alice@example.com', startedAt: '2026-04-01T10:00:00Z', durationSeconds: 360, totalEvents: 11 },
    { sessionId: 'sess-2', email: 'alice@example.com', startedAt: '2026-04-02T10:00:00Z', durationSeconds: 240, totalEvents: 8 },
    { sessionId: 'sess-3', email: null, startedAt: '2026-04-03T10:00:00Z', durationSeconds: 180, totalEvents: 17 },
    { sessionId: 'sess-4', email: null, startedAt: '2026-04-04T10:00:00Z', durationSeconds: 270, totalEvents: 9 },
  ],
};

describe('DemoAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('renders stat cards with initial values', () => {
    render(<DemoAnalytics stats={mockStats} />);
    expect(screen.getByText('7')).toBeDefined();        // emailCaptureCount
    expect(screen.getByText('13')).toBeDefined();       // sessionCount
    expect(screen.getByText('42')).toBeDefined();       // totalInteractions
    expect(screen.getByText('4m 23s')).toBeDefined();  // avgDurationSeconds: 263s
  });

  it('renders email captures list with email and source', () => {
    render(<DemoAnalytics stats={mockStats} />);
    // alice appears in both capture rows and session table rows — use getAllByText
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
    // cap-1: hero, cap-2: cta
    expect(screen.getAllByText(/via hero/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/via cta/).length).toBeGreaterThan(0);
  });

  it('renders session table with duration formatted as Xm Ys', () => {
    render(<DemoAnalytics stats={mockStats} />);
    expect(screen.getByText('6m 0s')).toBeDefined();   // 360s
    expect(screen.getByText('4m 0s')).toBeDefined();   // 240s
    expect(screen.getByText('3m 0s')).toBeDefined();   // 180s
    expect(screen.getByText('4m 30s')).toBeDefined();  // 270s
    expect(screen.getAllByText('Anonymous').length).toBe(2);
  });

  it('decrements stat cards after successful GDPR delete', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<DemoAnalytics stats={mockStats} />);

    // alice has 2 email capture rows — click delete on first one
    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('6')).toBeDefined();      // emailCaptureCount: 7 - 1
      expect(screen.getByText('11')).toBeDefined();     // sessionCount: 13 - 2 sessions for alice
      expect(screen.getByText('23')).toBeDefined();     // totalInteractions: 42 - (11+8) = 23
      // avg = (180+270)/2 = 225s = "3m 45s" — unique, not in session table
      expect(screen.getByText('3m 45s')).toBeDefined();
    });

    // alice's email capture rows should be gone
    expect(screen.queryByText('alice@example.com')).toBeNull();
  });

  it('triggers file download when export is clicked', async () => {
    const user = userEvent.setup();
    render(<DemoAnalytics stats={mockStats} />);

    // Spy after render so React's own createElement calls are unaffected
    const mockClick = vi.fn();
    const mockAnchor = { href: '', download: '', click: mockClick };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockReturnValueOnce(mockAnchor as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockReturnValueOnce(mockAnchor as unknown as Node);

    const exportButtons = screen.getAllByRole('button', { name: /export/i });
    await user.click(exportButtons[0]);

    expect(mockAnchor.href).toContain('export-user-data');
    expect(mockAnchor.href).toContain('alice%40example.com');
    expect(mockClick).toHaveBeenCalled();
  });

  it('does not decrement stats after failed delete', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();

    render(<DemoAnalytics stats={mockStats} />);

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('Failed to delete data for alice@example.com')).toBeDefined();
    });

    // Stats should remain unchanged
    expect(screen.getByText('7')).toBeDefined();   // emailCaptureCount unchanged
    expect(screen.getByText('13')).toBeDefined();  // sessionCount unchanged
    expect(screen.getByText('42')).toBeDefined();  // totalInteractions unchanged
  });
});
