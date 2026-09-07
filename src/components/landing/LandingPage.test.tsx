// ABOUT: Tests for the public landing page component
// ABOUT: Validates content, email form behaviour, and navigation links

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LandingPage from './LandingPage';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: vi.fn() })),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock tracking hook
const mockTrackPageEvent = vi.fn();
const mockCaptureEmail = vi.fn();
const mockSetSessionEmail = vi.fn();
let mockStoredEmail: string | null = null;
vi.mock('@/hooks/useTracking', () => ({
  usePageTracking: vi.fn(() => ({ trackPageEvent: mockTrackPageEvent, visitorId: 'test-visitor' })),
  captureEmail: (...args: unknown[]) => mockCaptureEmail(...args),
  setSessionEmail: (...args: unknown[]) => mockSetSessionEmail(...args),
  getStoredEmail: vi.fn(() => mockStoredEmail),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  ArrowRight: () => <span data-testid="arrow-right" />,
  Zap: () => null,
  MessageSquareWarning: () => null,
  Search: () => null,
  BookOpen: () => null,
  Filter: () => null,
  Clock: () => null,
  ChevronRight: () => null,
  ChevronDown: () => <span data-testid="chevron-down" />,
  ChevronUp: () => <span data-testid="chevron-up" />,
  ExternalLink: () => null,
  Archive: () => null,
  StickyNote: () => null,
}));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoredEmail = null;
    // jsdom doesn't implement scrollIntoView — mock it so scroll-based nav tests don't throw
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  describe('Content', () => {
    it('renders the hero heading', () => {
      render(<LandingPage />);
      expect(screen.getByText(/separate the signal/i)).toBeDefined();
    });

    it('renders the depth-of-engagement tagline', () => {
      render(<LandingPage />);
      // Text appears in both hero and footer — at least one occurrence is enough
      expect(screen.getAllByText(/depth-of-engagement triage/i).length).toBeGreaterThan(0);
    });

    it('renders the features section', () => {
      render(<LandingPage />);
      expect(screen.getByText(/three lenses on every article/i)).toBeDefined();
      // 'Summary' and 'Commentary' appear as tab labels on each preview card
      expect(screen.getAllByText(/^summary$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^commentary$/i).length).toBeGreaterThan(0);
    });

    it('renders the how it works section', () => {
      render(<LandingPage />);
      // 'How it works' appears as a section heading and nav button label
      expect(screen.getAllByText(/how it works/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/save to readwise reader/i)).toBeDefined();
    });

    it('renders the Le Guin quote', () => {
      render(<LandingPage />);
      expect(screen.getByText(/ansible is a device/i)).toBeDefined();
      expect(screen.getByText(/ursula k. le guin/i)).toBeDefined();
    });

    it('renders privacy link in footer', () => {
      render(<LandingPage />);
      const privacyLinks = screen.getAllByRole('link', { name: /privacy/i });
      expect(privacyLinks.length).toBeGreaterThan(0);
    });

    it('renders login link in footer', () => {
      render(<LandingPage />);
      const loginLink = screen.getByRole('link', { name: /login/i });
      expect(loginLink).toBeDefined();
    });
  });

  describe('Email capture form', () => {
    it('shows email input and submit button', () => {
      render(<LandingPage />);
      expect(screen.getAllByPlaceholderText(/your@email.com/i).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /try it yourself/i }).length).toBeGreaterThan(0);
    });

    it('submit button is disabled until consent checkbox is checked', () => {
      render(<LandingPage />);
      const submitButtons = screen.getAllByRole('button', { name: /try it yourself/i });
      // At least one submit button should be disabled without consent
      expect(submitButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
    });

    it('submit button enables when consent checkbox is checked', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      const submitButtons = screen.getAllByRole('button', { name: /try it yourself/i });
      // After checking consent, first submit button should be enabled
      expect((submitButtons[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it('tracks landing_page_view on mount', () => {
      render(<LandingPage />);
      expect(mockTrackPageEvent).toHaveBeenCalledWith('landing_page_view');
    });
  });

  describe('Navigation', () => {
    it('renders navbar with nav links', () => {
      render(<LandingPage />);
      // 'Ansible' appears in nav, footer, and quote section — at least one is fine
      expect(screen.getAllByText('Ansible').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /features/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /how it works/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /try the demo/i })).toBeDefined();
    });
  });

  describe('Navigation tracking — nav_click labels', () => {
    it('fires nav_click with label "features" when Features nav button clicked', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByRole('button', { name: /features/i }));
      expect(mockTrackPageEvent).toHaveBeenCalledWith('nav_click', { label: 'features' });
    });

    it('fires nav_click with label "how_it_works" when How it works nav button clicked', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByRole('button', { name: /how it works/i }));
      expect(mockTrackPageEvent).toHaveBeenCalledWith('nav_click', { label: 'how_it_works' });
    });

    it('fires nav_click with label "try_demo" when Try the demo nav button clicked', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByRole('button', { name: /try the demo/i }));
      expect(mockTrackPageEvent).toHaveBeenCalledWith('nav_click', { label: 'try_demo' });
    });

    it('fires nav_click with label "footer_privacy" when footer privacy link clicked', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      // Footer link text is "Privacy" (capital P); consent links say "privacy policy"
      const footerPrivacyLink = screen.getByRole('link', { name: /^Privacy$/ });
      await user.click(footerPrivacyLink);
      expect(mockTrackPageEvent).toHaveBeenCalledWith('nav_click', { label: 'footer_privacy' });
    });

    it('fires nav_click with label "footer_login" when login link clicked', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByRole('link', { name: /login/i }));
      expect(mockTrackPageEvent).toHaveBeenCalledWith('nav_click', { label: 'footer_login' });
    });
  });

  describe('Product preview', () => {
    it('renders preview article cards', () => {
      render(<LandingPage />);
      // EU AI Act article title appears in both preview and features
      expect(screen.getByText(/EU's AI Act Enforcement/i)).toBeDefined();
    });

    it('renders summary and commentary tabs on cards', () => {
      render(<LandingPage />);
      const summaryTabs = screen.getAllByRole('tab', { name: /summary/i });
      expect(summaryTabs.length).toBeGreaterThan(0);
    });
  });

  describe('Email submission', () => {
    // Hero form is the first email input on the page; the final CTA form is the second
    const heroForm = () => screen.getAllByPlaceholderText(/your@email.com/i)[0].closest('form')!;

    it('captures a valid hero email, tracks the signup, and routes to the demo', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.type(screen.getAllByPlaceholderText(/your@email.com/i)[0], '  manne@example.com  ');
      await user.click(screen.getAllByRole('checkbox')[0]);
      await user.click(screen.getAllByRole('button', { name: /try it yourself/i })[0]);

      expect(mockCaptureEmail).toHaveBeenCalledWith('manne@example.com', 'hero', true);
      expect(mockSetSessionEmail).toHaveBeenCalledWith('manne@example.com');
      expect(mockTrackPageEvent).toHaveBeenCalledWith('demo_signup', { source: 'hero' });
      expect(mockPush).toHaveBeenCalledWith('/demo');
      // Hero swaps the form for the go-to-demo button once submitted
      expect(screen.getAllByRole('button', { name: /see ansible in action/i }).length).toBe(1);
    });

    it('captures a valid final-CTA email with the cta source', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.type(screen.getAllByPlaceholderText(/your@email.com/i)[1], 'cta@example.com');
      await user.click(screen.getAllByRole('checkbox')[1]);
      await user.click(screen.getAllByRole('button', { name: /try it yourself/i })[1]);

      expect(mockCaptureEmail).toHaveBeenCalledWith('cta@example.com', 'cta', true);
      expect(mockTrackPageEvent).toHaveBeenCalledWith('demo_signup', { source: 'cta' });
      expect(mockPush).toHaveBeenCalledWith('/demo');
    });

    it('ignores a submit with a malformed email even when consented', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.type(screen.getAllByPlaceholderText(/your@email.com/i)[0], 'not-an-email');
      await user.click(screen.getAllByRole('checkbox')[0]);
      // Bypass native constraint validation to reach the component's own guard
      fireEvent.submit(heroForm());

      expect(mockCaptureEmail).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('ignores a submit without consent', () => {
      render(<LandingPage />);
      fireEvent.change(screen.getAllByPlaceholderText(/your@email.com/i)[0], { target: { value: 'a@b.co' } });
      fireEvent.submit(heroForm());
      expect(mockCaptureEmail).not.toHaveBeenCalled();
    });
  });

  describe('Returning visitor (email already stored)', () => {
    beforeEach(() => {
      mockStoredEmail = 'stored@example.com';
    });

    it('shows go-to-demo buttons instead of forms and tracks the click', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      expect(screen.queryAllByPlaceholderText(/your@email.com/i).length).toBe(0);
      const demoButtons = screen.getAllByRole('button', { name: /see ansible in action/i });
      expect(demoButtons.length).toBe(2);

      await user.click(demoButtons[0]);
      await user.click(demoButtons[1]);

      expect(mockTrackPageEvent).toHaveBeenCalledWith('nav_click', { label: 'go_to_demo' });
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith('/demo');
    });

    it('navbar Try the demo routes straight to /demo', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByRole('button', { name: /try the demo/i }));
      expect(mockPush).toHaveBeenCalledWith('/demo');
    });

    it('navbar Try the demo scrolls to the CTA when no email is stored', async () => {
      mockStoredEmail = null;
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByRole('button', { name: /try the demo/i }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('Preview card interactions', () => {
    it('expands and collapses the summary', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      expect(screen.queryByText(/survey of 340 European enterprises/i)).toBeNull();
      await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
      expect(screen.getByText(/survey of 340 European enterprises/i)).toBeDefined();

      await user.click(screen.getAllByRole('button', { name: /collapse/i })[0]);
      expect(screen.queryByText(/survey of 340 European enterprises/i)).toBeNull();
    });

    it('switches to commentary, shows a teaser, and resets expansion on tab change', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
      await user.click(screen.getAllByRole('tab', { name: /commentary/i })[0]);

      // Tab change collapses again, so only the first paragraph + ellipsis shows
      expect(screen.getByText(/classification ambiguities.*\.\.\.$/i)).toBeDefined();
      expect(screen.queryByText(/Methodological caveat/i)).toBeNull();

      await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
      expect(screen.getByText(/Methodological caveat/i)).toBeDefined();
    });

    it('adds, edits, and cancels a note', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.click(screen.getAllByRole('button', { name: /add note/i })[0]);
      const textarea = screen.getByPlaceholderText(/add your thoughts/i);
      const save = screen.getByRole('button', { name: /save note/i });
      expect((save as HTMLButtonElement).disabled).toBe(true);

      await user.type(textarea, '  worth a read  ');
      expect(screen.getByText('16 / 10,000')).toBeDefined();
      await user.click(save);

      expect(screen.getByText('worth a read')).toBeDefined();
      expect(screen.queryByPlaceholderText(/add your thoughts/i)).toBeNull();

      // Edit note clears the saved note and reopens the form
      await user.click(screen.getByRole('button', { name: /edit note/i }));
      expect(screen.queryByText('worth a read')).toBeNull();
      expect(screen.getByPlaceholderText(/add your thoughts/i)).toBeDefined();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByPlaceholderText(/add your thoughts/i)).toBeNull();

      // Add note toggles the form open and closed again
      await user.click(screen.getAllByRole('button', { name: /add note/i })[0]);
      expect(screen.getByPlaceholderText(/add your thoughts/i)).toBeDefined();
      await user.click(screen.getAllByRole('button', { name: /add note/i })[0]);
      expect(screen.queryByPlaceholderText(/add your thoughts/i)).toBeNull();
    });

    it('toggles interesting and not-interesting reactions', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      const interesting = screen.getAllByTitle('Interesting')[0];
      const notInteresting = screen.getAllByTitle('Not interesting')[0];

      await user.click(interesting);
      expect(interesting.className).toContain('bg-yellow-100');
      await user.click(interesting);
      expect(interesting.className).not.toContain('bg-yellow-100');

      await user.click(notInteresting);
      expect(notInteresting.className).toContain('bg-red-100');
      await user.click(notInteresting);
      expect(notInteresting.className).not.toContain('bg-red-100');
    });

    it('opens the Reader popup and closes it via the backdrop or the button', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.click(screen.getAllByRole('button', { name: /open in reader/i })[0]);
      expect(screen.getByText(/piqued your interest/i)).toBeDefined();

      await user.click(document.querySelector('.fixed.inset-0')!);
      expect(screen.queryByText(/piqued your interest/i)).toBeNull();

      const openButton = screen.getAllByRole('button', { name: /open in reader/i })[0];
      await user.click(openButton);
      await user.click(openButton);
      expect(screen.queryByText(/piqued your interest/i)).toBeNull();
    });

    it('archives a card and Sync restores it with a popup', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      await user.click(screen.getAllByRole('button', { name: /archive/i })[0]);
      expect(screen.queryByText(/EU's AI Act Enforcement/i)).toBeNull();

      await user.click(screen.getByRole('button', { name: /^sync$/i }));
      expect(screen.getByText(/EU's AI Act Enforcement/i)).toBeDefined();
      expect(screen.getByText(/unread items are synced/i)).toBeDefined();

      await user.click(document.querySelector('.fixed.inset-0')!);
      expect(screen.queryByText(/unread items are synced/i)).toBeNull();
    });
  });
});
