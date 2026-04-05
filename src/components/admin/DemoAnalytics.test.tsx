// ABOUT: Tests for DemoAnalytics component
// ABOUT: Validates stat card rendering, session table, and stat decrement after GDPR delete

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoAnalytics from './DemoAnalytics';
import type { DemoStats } from './types';

global.fetch = vi.fn();

// Values chosen to be unique — no collision between stat cards and session table cells
const mockStats: DemoStats = {
  emailCaptureCount: 7,
  sessionCount: 13,
  totalInteractions: 42,
  avgDurationMinutes: 5,
  eventTypeBreakdown: [{ eventType: 'tab_switch', count: 20 }],
  sessions: [
    { sessionId: 'sess-1', email: 'alice@example.com', startedAt: '2026-04-01T10:00:00Z', durationMinutes: 6, totalEvents: 11 },
    { sessionId: 'sess-2', email: 'alice@example.com', startedAt: '2026-04-02T10:00:00Z', durationMinutes: 4, totalEvents: 8 },
    { sessionId: 'sess-3', email: null, startedAt: '2026-04-03T10:00:00Z', durationMinutes: 3, totalEvents: 17 },
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
    expect(screen.getByText('7')).toBeDefined();   // emailCaptureCount
    expect(screen.getByText('13')).toBeDefined();  // sessionCount
    expect(screen.getByText('42')).toBeDefined();  // totalInteractions
  });

  it('decrements stat cards after successful GDPR delete', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<DemoAnalytics stats={mockStats} />);

    // alice has 2 sessions with 11+8=19 events
    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('6')).toBeDefined();    // emailCaptureCount: 7 - 1
      expect(screen.getByText('11')).toBeDefined();   // sessionCount: 13 - 2 sessions for alice
      expect(screen.getByText('23')).toBeDefined();   // totalInteractions: 42 - 19 = 23
      expect(screen.getByText('3 min')).toBeDefined(); // avgDuration: only sess-3 (3 min) remains
    });

    // alice's rows should be gone from the table
    expect(screen.queryByText('alice@example.com')).toBeNull();
  });

  it('triggers file download when Export is clicked', async () => {
    const user = userEvent.setup();
    render(<DemoAnalytics stats={mockStats} />);

    // Spy after render so React's own createElement calls are unaffected
    const mockClick = vi.fn();
    const mockAnchor = { href: '', download: '', click: mockClick };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockReturnValueOnce(mockAnchor as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockReturnValueOnce(mockAnchor as unknown as Node);

    const exportButtons = screen.getAllByRole('button', { name: /export/i });
    expect(exportButtons.length).toBe(2); // one per session with email (alice has 2 sessions)
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
