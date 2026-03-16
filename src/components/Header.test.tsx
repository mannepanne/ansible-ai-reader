// ABOUT: Tests for Header component
// ABOUT: Validates rendering, props, sync button, logout functionality

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';

// Mock fetch for logout
global.fetch = vi.fn();

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Header', () => {
  it('renders branding link', () => {
    render(<Header userEmail="test@example.com" />);

    const brandingLink = screen.getByRole('link', {
      name: /ansible ai reader/i,
    });
    expect(brandingLink).toBeInTheDocument();
    expect(brandingLink).toHaveAttribute('href', '/');
  });

  it('displays user email', () => {
    render(<Header userEmail="test@example.com" />);

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('displays different user emails', () => {
    const { rerender } = render(<Header userEmail="first@example.com" />);
    expect(screen.getByText('first@example.com')).toBeInTheDocument();

    rerender(<Header userEmail="second@example.com" />);
    expect(screen.getByText('second@example.com')).toBeInTheDocument();
  });

  it('renders logout button', () => {
    render(<Header userEmail="test@example.com" />);

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    expect(logoutButton).toBeInTheDocument();
  });

  it('calls logout API when logout button clicked', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // Mock window.location.href
    delete (window as any).location;
    window.location = { href: '' } as any;

    render(<Header userEmail="test@example.com" />);

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    fireEvent.click(logoutButton);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
      });
    });
  });

  it('does not show sync button by default', () => {
    render(<Header userEmail="test@example.com" />);

    const syncButton = screen.queryByRole('button', { name: /sync/i });
    expect(syncButton).not.toBeInTheDocument();
  });

  it('shows sync button when showSync is true', () => {
    const mockOnSync = vi.fn();

    render(
      <Header userEmail="test@example.com" showSync={true} onSync={mockOnSync} />
    );

    const syncButton = screen.getByRole('button', { name: /sync/i });
    expect(syncButton).toBeInTheDocument();
  });

  it('calls onSync when sync button clicked', () => {
    const mockOnSync = vi.fn();

    render(
      <Header userEmail="test@example.com" showSync={true} onSync={mockOnSync} />
    );

    const syncButton = screen.getByRole('button', { name: /sync/i });
    fireEvent.click(syncButton);

    expect(mockOnSync).toHaveBeenCalledTimes(1);
  });

  it('disables sync button when isSyncing is true', () => {
    const mockOnSync = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showSync={true}
        onSync={mockOnSync}
        isSyncing={true}
      />
    );

    const syncButton = screen.getByRole('button', { name: /syncing/i });
    expect(syncButton).toBeDisabled();
  });

  it('shows "Syncing..." text when isSyncing is true', () => {
    const mockOnSync = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showSync={true}
        onSync={mockOnSync}
        isSyncing={true}
      />
    );

    expect(screen.getByText('Syncing...')).toBeInTheDocument();
    expect(screen.queryByText('Sync')).not.toBeInTheDocument();
  });

  it('prevents sync button click when syncing', () => {
    const mockOnSync = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showSync={true}
        onSync={mockOnSync}
        isSyncing={true}
      />
    );

    const syncButton = screen.getByRole('button', { name: /syncing/i });
    fireEvent.click(syncButton);

    // Disabled button should not trigger onClick
    expect(mockOnSync).not.toHaveBeenCalled();
  });

  it('does not show regenerate tags button by default', () => {
    render(<Header userEmail="test@example.com" />);

    const button = screen.queryByRole('button', { name: /regenerate tags/i });
    expect(button).not.toBeInTheDocument();
  });

  it('shows regenerate tags button when showRegenerateTags is true', () => {
    const mockOnRegenerate = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showRegenerateTags={true}
        onRegenerateTags={mockOnRegenerate}
      />
    );

    const button = screen.getByRole('button', { name: /regenerate tags/i });
    expect(button).toBeInTheDocument();
  });

  it('calls onRegenerateTags when button clicked', () => {
    const mockOnRegenerate = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showRegenerateTags={true}
        onRegenerateTags={mockOnRegenerate}
      />
    );

    const button = screen.getByRole('button', { name: /regenerate tags/i });
    fireEvent.click(button);

    expect(mockOnRegenerate).toHaveBeenCalledTimes(1);
  });

  it('disables regenerate tags button when isRegenerating is true', () => {
    const mockOnRegenerate = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showRegenerateTags={true}
        onRegenerateTags={mockOnRegenerate}
        isRegenerating={true}
      />
    );

    const button = screen.getByRole('button', { name: /processing/i });
    expect(button).toBeDisabled();
  });

  it('shows "Processing..." text when isRegenerating is true', () => {
    const mockOnRegenerate = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showRegenerateTags={true}
        onRegenerateTags={mockOnRegenerate}
        isRegenerating={true}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.queryByText('Regenerate Tags')).not.toBeInTheDocument();
  });

  it('prevents regenerate tags button click when regenerating', () => {
    const mockOnRegenerate = vi.fn();

    render(
      <Header
        userEmail="test@example.com"
        showRegenerateTags={true}
        onRegenerateTags={mockOnRegenerate}
        isRegenerating={true}
      />
    );

    const button = screen.getByRole('button', { name: /processing/i });
    fireEvent.click(button);

    // Disabled button should not trigger onClick
    expect(mockOnRegenerate).not.toHaveBeenCalled();
  });

  it('renders with all props', () => {
    const mockOnSync = vi.fn();

    render(
      <Header
        userEmail="complete@example.com"
        showSync={true}
        onSync={mockOnSync}
        isSyncing={false}
      />
    );

    expect(screen.getByText('Ansible AI Reader')).toBeInTheDocument();
    expect(screen.getByText('complete@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});
