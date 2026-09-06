// @vitest-environment node
// ABOUT: Tests for the Fika confirmation page renderer
// ABOUT: Escaping, optional parts, tone

import { describe, it, expect } from 'vitest';
import { renderFikaPage } from './pages';

describe('renderFikaPage', () => {
  it('renders heading, item title, detail and the link, all escaped', () => {
    const html = renderFikaPage({
      heading: 'Archived <ok>',
      itemTitle: 'Title & co',
      detail: 'Also "in" Reader',
      linkHref: 'https://app.test/summaries?a=1&b=2',
      linkLabel: 'Back to Ansible',
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Archived &lt;ok&gt;');
    expect(html).toContain('Title &amp; co');
    expect(html).toContain('Also &quot;in&quot; Reader');
    expect(html).toContain('href="https://app.test/summaries?a=1&amp;b=2"');
    expect(html).toContain('Back to Ansible</a>');
    expect(html).toContain('color:#198754');
  });

  it('omits optional parts and uses the error tone', () => {
    const html = renderFikaPage({ heading: 'Expired', linkHref: '/', linkLabel: 'Open', tone: 'error' });
    expect(html).not.toContain('font-size:17px');
    expect(html).toContain('color:#6c757d;margin:0 0 8px');
    expect(html).toContain('<div style="height:8px;"></div>');
  });
});
