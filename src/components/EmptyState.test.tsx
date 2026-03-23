// ABOUT: Tests for EmptyState component
// ABOUT: Validates rendering of empty state message and Ansible symbol

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders the main heading', () => {
    render(<EmptyState />);

    expect(screen.getByText('Knowledge Synchronized')).toBeInTheDocument();
  });

  it('renders the completion message', () => {
    render(<EmptyState />);

    expect(
      screen.getByText(/All articles processed. Your ansible is fully charged./)
    ).toBeInTheDocument();
  });

  it('renders the call to action', () => {
    render(<EmptyState />);

    expect(
      screen.getByText(/Time to transmit what you've learned to the world./)
    ).toBeInTheDocument();
  });

  it('renders the Ansible SVG symbol', () => {
    render(<EmptyState />);

    const svg = screen.getByRole('img', {
      name: /Ansible symbol.*knowledge flowing outward/i,
    });
    expect(svg).toBeInTheDocument();
  });

  it('has accessible title and description for SVG', () => {
    render(<EmptyState />);

    expect(screen.getByText('Transmission Complete')).toBeInTheDocument();
    expect(
      screen.getByText(/you've absorbed the information/i)
    ).toBeInTheDocument();
  });
});
