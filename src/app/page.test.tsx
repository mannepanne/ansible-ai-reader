// ABOUT: Basic smoke tests for home page
// ABOUT: Verifies page renders and displays correct content

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home Page', () => {
  it('renders the main heading', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', { name: /ansible/i });
    expect(heading).toBeDefined();
  });

  it('displays the tagline', () => {
    render(<Home />);
    const tagline = screen.getByText(/AI-Powered Reading Triage for Readwise Reader/i);
    expect(tagline).toBeDefined();
  });

  it('shows Phase 1 completion status', () => {
    render(<Home />);
    const status = screen.getByText(/Phase 1: Foundation - Hello World/i);
    expect(status).toBeDefined();
  });
});
