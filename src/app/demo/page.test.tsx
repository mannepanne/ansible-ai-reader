// ABOUT: Tests for the interactive demo page
// ABOUT: Validates email gate, article rendering, and interaction tracking

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoPage from './page';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: mockReplace })),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock tracking hook
const mockTrackEvent = vi.fn();
let mockStoredEmail: string | null = null;

vi.mock('@/hooks/useTracking', () => ({
  useTracking: vi.fn(() => ({ trackEvent: mockTrackEvent, sessionId: 'test-session' })),
  getStoredEmail: vi.fn(() => mockStoredEmail),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="arrow-left" />,
  ExternalLink: () => <span data-testid="external-link" />,
  Archive: () => <span data-testid="archive-icon" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  ChevronUp: () => <span data-testid="chevron-up" />,
  StickyNote: () => <span data-testid="sticky-note" />,
}));

describe('DemoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoredEmail = null;
  });

  describe('Email gate', () => {
    it('redirects to / when no email is stored', () => {
      mockStoredEmail = null;
      render(<DemoPage />);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('renders demo when email is stored', async () => {
      mockStoredEmail = 'test@example.com';
      render(<DemoPage />);
      // Should not redirect
      expect(mockReplace).not.toHaveBeenCalled();
      // Should show DEMO badge
      expect(screen.getByText('DEMO')).toBeDefined();
    });
  });

  describe('Demo content', () => {
    beforeEach(() => {
      mockStoredEmail = 'test@example.com';
    });

    it('renders all 5 demo articles', () => {
      render(<DemoPage />);
      // Article titles appear as headings — use getAllByText since text may also appear in content
      expect(screen.getAllByText(/EU's AI Act Enforcement/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Semiconductor Reshoring/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Mpox/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Carbon Offset/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Algorithm Transparency/i).length).toBeGreaterThan(0);
    });

    it('renders the amber demo banner', () => {
      render(<DemoPage />);
      expect(screen.getByText(/read-only demo/i)).toBeDefined();
    });

    it('renders Sync button in header', () => {
      render(<DemoPage />);
      expect(screen.getByRole('button', { name: /sync/i })).toBeDefined();
    });

    it('tracks page_view on mount', () => {
      render(<DemoPage />);
      expect(mockTrackEvent).toHaveBeenCalledWith('page_view', { page: 'demo' });
    });
  });

  describe('Article interactions', () => {
    beforeEach(() => {
      mockStoredEmail = 'test@example.com';
    });

    it('renders Summary and Commentary tabs on each article', () => {
      render(<DemoPage />);
      const summaryTabs = screen.getAllByRole('tab', { name: /summary/i });
      expect(summaryTabs.length).toBe(5);
    });

    it('archives an article when Archive is clicked', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      const archiveButtons = screen.getAllByRole('button', { name: /archive/i });
      await user.click(archiveButtons[0]);

      expect(mockTrackEvent).toHaveBeenCalledWith('archive', expect.objectContaining({ article_id: '1' }));
      // Article should be removed from view (4 summary tabs remaining)
      expect(screen.getAllByRole('tab', { name: /summary/i }).length).toBe(4);
    });
  });
});
