// ABOUT: Tests for the privacy policy page
// ABOUT: Validates the static policy headings render and the page view is tracked

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacyPage from './page';

const mockTrackPageEvent = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/hooks/useTracking', () => ({
  usePageTracking: vi.fn(() => ({ trackPageEvent: mockTrackPageEvent, visitorId: 'test-visitor' })),
}));

describe('PrivacyPage', () => {
  beforeEach(() => {
    mockTrackPageEvent.mockClear();
  });

  it('renders the policy title and section headings', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Who we are' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Your rights' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Email addresses' })).toBeInTheDocument();
  });

  it('links back to the home page', () => {
    render(<PrivacyPage />);

    const backLink = screen.getByRole('link', { name: /back to home/i });
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('tracks a privacy page view on mount', () => {
    render(<PrivacyPage />);

    expect(mockTrackPageEvent).toHaveBeenCalledWith('privacy_page_view');
  });
});
