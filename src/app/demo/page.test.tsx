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

    it('Sync restores archived articles, shows the popup, and tracks sync', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      await user.click(screen.getAllByRole('button', { name: /archive/i })[0]);
      expect(screen.getAllByRole('tab', { name: /summary/i }).length).toBe(4);

      await user.click(screen.getByRole('button', { name: /^sync$/i }));
      expect(mockTrackEvent).toHaveBeenCalledWith('sync');
      expect(screen.getAllByRole('tab', { name: /summary/i }).length).toBe(5);
      expect(screen.getByText(/unread items are synced/i)).toBeDefined();

      await user.click(document.querySelector('.fixed.inset-0')!);
      expect(screen.queryByText(/unread items are synced/i)).toBeNull();
    });

    it('tracks expand and collapse and swaps the summary text', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
      expect(mockTrackEvent).toHaveBeenCalledWith('expand', { article_id: '1' });
      expect(screen.getByText(/survey of 340 European enterprises/i)).toBeDefined();

      await user.click(screen.getAllByRole('button', { name: /collapse/i })[0]);
      expect(mockTrackEvent).toHaveBeenCalledWith('collapse', { article_id: '1' });
      expect(screen.queryByText(/survey of 340 European enterprises/i)).toBeNull();
    });

    it('tracks tab switches, collapses on switch, and shows the commentary teaser', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
      await user.click(screen.getAllByRole('tab', { name: /commentary/i })[0]);

      expect(mockTrackEvent).toHaveBeenCalledWith('tab_switch', { article_id: '1', tab: 'commentary' });
      expect(screen.getByText(/\.\.\.$/)).toBeDefined();
      expect(screen.queryByText(/Methodological caveat/i)).toBeNull();

      await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
      expect(screen.getByText(/Methodological caveat/i)).toBeDefined();
    });

    it('adds a note (tracked), edits it, and cancels', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      await user.click(screen.getAllByRole('button', { name: /add note/i })[0]);
      const save = screen.getByRole('button', { name: /save note/i });
      expect((save as HTMLButtonElement).disabled).toBe(true);

      await user.type(screen.getByPlaceholderText(/add your thoughts/i), ' read later ');
      expect(screen.getByText('12 / 10,000')).toBeDefined();
      await user.click(save);

      expect(mockTrackEvent).toHaveBeenCalledWith('add_note', { article_id: '1' });
      expect(screen.getByText('read later')).toBeDefined();

      await user.click(screen.getByRole('button', { name: /edit note/i }));
      expect(screen.queryByText('read later')).toBeNull();
      expect(screen.getByPlaceholderText(/add your thoughts/i)).toBeDefined();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByPlaceholderText(/add your thoughts/i)).toBeNull();

      await user.click(screen.getAllByRole('button', { name: /add note/i })[0]);
      await user.click(screen.getAllByRole('button', { name: /add note/i })[0]);
      expect(screen.queryByPlaceholderText(/add your thoughts/i)).toBeNull();
    });

    it('tracks reactions only when set, not when cleared', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      const interesting = screen.getAllByTitle('Interesting')[0];
      const notInteresting = screen.getAllByTitle('Not interesting')[0];

      await user.click(interesting);
      expect(mockTrackEvent).toHaveBeenCalledWith('reaction', { article_id: '1', reaction: 'interesting' });
      expect(interesting.className).toContain('bg-yellow-100');

      mockTrackEvent.mockClear();
      await user.click(interesting);
      expect(interesting.className).not.toContain('bg-yellow-100');
      expect(mockTrackEvent).not.toHaveBeenCalledWith('reaction', expect.anything());

      await user.click(notInteresting);
      expect(mockTrackEvent).toHaveBeenCalledWith('reaction', { article_id: '1', reaction: 'not-interesting' });
      expect(notInteresting.className).toContain('bg-red-100');

      mockTrackEvent.mockClear();
      await user.click(notInteresting);
      expect(notInteresting.className).not.toContain('bg-red-100');
      expect(mockTrackEvent).not.toHaveBeenCalled();
    });

    it('tracks open_reader once per open and closes via backdrop or button', async () => {
      const user = userEvent.setup();
      render(<DemoPage />);

      const openButton = screen.getAllByRole('button', { name: /open in reader/i })[0];
      await user.click(openButton);
      expect(mockTrackEvent).toHaveBeenCalledWith('open_reader', { article_id: '1' });
      expect(screen.getByText(/piqued your interest/i)).toBeDefined();

      await user.click(document.querySelector('.fixed.inset-0')!);
      expect(screen.queryByText(/piqued your interest/i)).toBeNull();

      mockTrackEvent.mockClear();
      await user.click(openButton);
      await user.click(openButton);
      expect(screen.queryByText(/piqued your interest/i)).toBeNull();
      // Closing via the button is not a fresh open, so only one open_reader event
      expect(mockTrackEvent.mock.calls.filter((c) => c[0] === 'open_reader').length).toBe(1);
    });
  });
});
