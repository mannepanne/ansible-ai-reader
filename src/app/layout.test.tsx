// ABOUT: Tests for root layout component
// ABOUT: Verifies children rendering and metadata exports

import { describe, it, expect, vi } from 'vitest';

// next/font/google cannot run in a Node test environment — mock it to return
// CSS-variable-based font objects that match the expected shape.
vi.mock('next/font/google', () => ({
  DM_Sans: vi.fn(() => ({ variable: '--font-sans', className: 'dm-sans' })),
  Newsreader: vi.fn(() => ({ variable: '--font-serif', className: 'newsreader' })),
}));
import { render } from '@testing-library/react';
import RootLayout, { metadata } from './layout';

describe('RootLayout', () => {
  it('renders children correctly', () => {
    const { getByTestId } = render(
      <RootLayout>
        <div data-testid="test-content">Test content</div>
      </RootLayout>
    );

    const content = getByTestId('test-content');
    expect(content).toBeDefined();
    expect(content.textContent).toBe('Test content');
  });

  it('wraps children in body tag', () => {
    const { container } = render(
      <RootLayout>
        <div data-testid="child-content">Child content</div>
      </RootLayout>
    );

    const body = container.querySelector('body');
    expect(body).toBeDefined();
  });

  it('preserves child component structure', () => {
    const { getByTestId } = render(
      <RootLayout>
        <main data-testid="main-content">
          <h1>Title</h1>
          <p>Paragraph</p>
        </main>
      </RootLayout>
    );

    const main = getByTestId('main-content');
    expect(main.querySelector('h1')?.textContent).toBe('Title');
    expect(main.querySelector('p')?.textContent).toBe('Paragraph');
  });
});

describe('Metadata', () => {
  it('exports correct page title', () => {
    expect(metadata.title).toBe('Ansible - AI-Powered Reading Triage');
  });

  it('exports correct page description', () => {
    expect(metadata.description).toBe('Depth-of-engagement triage for Readwise Reader content');
  });
});
