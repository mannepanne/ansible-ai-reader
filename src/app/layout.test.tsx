// ABOUT: Tests for root layout component
// ABOUT: Verifies children rendering, metadata exports, and Cloudflare Web Analytics beacon

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// next/font/google cannot run in a Node test environment — mock it to return
// CSS-variable-based font objects that match the expected shape.
vi.mock('next/font/google', () => ({
  DM_Sans: vi.fn(() => ({ variable: '--font-sans', className: 'dm-sans' })),
  Newsreader: vi.fn(() => ({ variable: '--font-serif', className: 'newsreader' })),
}));

// next/script does not render synchronously in jsdom (it queues via Next's client
// loader). Replace with a pass-through <script> so assertions can inspect the
// rendered DOM for the beacon src, token, and strategy attribute.
vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => {
    const { strategy, ...rest } = props;
    return <script data-test-strategy={strategy as string} {...rest} />;
  },
}));

import { render } from '@testing-library/react';
import RootLayout, { metadata } from './layout';

describe('RootLayout', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', '352ed335bdae446cbc1c9ac0bebc2716');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

describe('Cloudflare Web Analytics beacon', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', '352ed335bdae446cbc1c9ac0bebc2716');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('injects the Cloudflare beacon script', () => {
    const { container } = render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    );

    const beacon = container.querySelector(
      'script[src="https://static.cloudflareinsights.com/beacon.min.js"]'
    );
    expect(beacon).not.toBeNull();
  });

  it('configures the beacon with the token from NEXT_PUBLIC_CF_ANALYTICS_TOKEN', () => {
    const { container } = render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    );

    const beacon = container.querySelector<HTMLScriptElement>(
      'script[src="https://static.cloudflareinsights.com/beacon.min.js"]'
    );
    const beaconConfig = beacon?.getAttribute('data-cf-beacon');
    expect(beaconConfig).toBeTruthy();
    const parsed = JSON.parse(beaconConfig as string);
    expect(parsed.token).toBe('352ed335bdae446cbc1c9ac0bebc2716');
  });

  it('uses afterInteractive strategy so it does not block rendering', () => {
    const { container } = render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    );

    const beacon = container.querySelector<HTMLScriptElement>(
      'script[src="https://static.cloudflareinsights.com/beacon.min.js"]'
    );
    expect(beacon?.getAttribute('data-test-strategy')).toBe('afterInteractive');
  });

  it('ships beacon with empty token when env var is unset (CI build without secret)', () => {
    vi.stubEnv('NEXT_PUBLIC_CF_ANALYTICS_TOKEN', '');

    const { container } = render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    );

    const beacon = container.querySelector<HTMLScriptElement>(
      'script[src="https://static.cloudflareinsights.com/beacon.min.js"]'
    );
    const parsed = JSON.parse(beacon?.getAttribute('data-cf-beacon') as string);
    expect(parsed.token).toBe('');
  });
});
