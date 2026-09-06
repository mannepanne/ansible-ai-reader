// @vitest-environment node
// ABOUT: Tests for the email markdown renderer
// ABOUT: Escaping first, allowlisted inline forms, list and paragraph blocks, plain-text fallback

import { describe, it, expect } from 'vitest';
import { escapeHtml, renderInline, renderSummaryHtml, renderSummaryText, renderProseHtml } from './markdown';

describe('escapeHtml', () => {
  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<b a="x" c='y'>&</b>`)).toBe('&lt;b a=&quot;x&quot; c=&#39;y&#39;&gt;&amp;&lt;/b&gt;');
  });
});

describe('renderInline', () => {
  it('renders bold and emphasis', () => {
    expect(renderInline('a **bold** and *em* and _em2_')).toBe('a <strong>bold</strong> and <em>em</em> and <em>em2</em>');
  });

  it('does not treat snake_case or a*b as emphasis', () => {
    expect(renderInline('snake_case_name and 2*3*4')).toBe('snake_case_name and 2*3*4');
  });

  it('renders http(s) links and leaves other schemes as text', () => {
    expect(renderInline('[site](https://example.com/a?b=1&amp;c=2)')).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" style="color:#0d6efd;text-decoration:none;">site</a>'
    );
    expect(renderInline('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
    expect(renderInline('[x](mailto:a@b.c)')).toBe('[x](mailto:a@b.c)');
  });
});

describe('renderSummaryHtml', () => {
  it('renders bullets as a styled list and escapes content', () => {
    const html = renderSummaryHtml('- First <point>\n- Second **strong**\n');
    expect(html).toBe(
      '<ul style="margin:0 0 12px;padding:0 0 0 22px;">' +
        '<li style="margin:0 0 8px;">First &lt;point&gt;</li>' +
        '<li style="margin:0 0 8px;">Second <strong>strong</strong></li>' +
        '</ul>'
    );
  });

  it('renders headings as bold paragraphs, numbered lists, and paragraphs', () => {
    const html = renderSummaryHtml('## Key points\n\n1. one\n2) two\n\nA closing line\nthat continues.');
    expect(html).toContain('<p style="margin:0 0 12px;"><strong>Key points</strong></p>');
    expect(html).toContain('<ol style="margin:0 0 12px;padding:0 0 0 22px;"><li style="margin:0 0 8px;">one</li><li style="margin:0 0 8px;">two</li></ol>');
    expect(html).toContain('<p style="margin:0 0 12px;">A closing line that continues.</p>');
  });

  it('switches list type when the marker changes and handles CRLF and • bullets', () => {
    const html = renderSummaryHtml('• a\r\n1. b');
    expect(html).toBe(
      '<ul style="margin:0 0 12px;padding:0 0 0 22px;"><li style="margin:0 0 8px;">a</li></ul>' +
        '<ol style="margin:0 0 12px;padding:0 0 0 22px;"><li style="margin:0 0 8px;">b</li></ol>'
    );
  });

  it('never emits raw script or attributes from the input', () => {
    const html = renderSummaryHtml('<script>alert(1)</script>\n- <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns an empty string for empty input', () => {
    expect(renderSummaryHtml('')).toBe('');
    expect(renderSummaryHtml('\n\n')).toBe('');
  });
});

describe('renderSummaryText', () => {
  it('flattens markdown for the plain-text part', () => {
    expect(renderSummaryText('## Summary\n\n- **Bold** point\n* [link](https://x.y)\n\n\n\nPara *em*')).toBe(
      'SUMMARY\n\n- Bold point\n- link (https://x.y)\n\nPara em'
    );
  });
});

describe('renderProseHtml', () => {
  it('splits paragraphs on blank lines and escapes', () => {
    expect(renderProseHtml('One <a>\n\n\nTwo\nstill two')).toBe(
      '<p style="margin:0 0 12px;">One &lt;a&gt;</p><p style="margin:0 0 12px;">Two<br>still two</p>'
    );
  });
});
