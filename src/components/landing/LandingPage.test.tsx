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
vi.mock('@/hooks/useTracking', () => ({
  usePageTracking: vi.fn(() => ({ trackPageEvent: mockTrackPageEvent, visitorId: 'test-visitor' })),
  captureEmail: vi.fn(),
  setSessionEmail: vi.fn(),
  getStoredEmail: vi.fn(() => null),
  verifyStoredEmail: vi.fn(async () => false),
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
});
