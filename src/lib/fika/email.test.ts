// @vitest-environment node
// ABOUT: Tests for the Fika email renderer
// ABOUT: Structure, escaping, prose fallback, one- and two-item batches, plain-text part

import { describe, it, expect } from 'vitest';
import { renderFikaEmail, readingMinutes, savedAgoLabel, FIKA_SUBJECT, type FikaEmailItem } from './email';

function item(overrides: Partial<FikaEmailItem> = {}): FikaEmailItem {
  return {
    id: 'item-1',
    title: 'Why Stockholm\'s rental queue is 20 years long',
    url: 'https://example.com/queue',
    author: 'Anna Lindqvist',
    source: 'Bloomberg',
    wordCount: 3000,
    savedDaysAgo: 47,
    summaryMarkdown: '- First point\n- Second **point**',
    proseSummary: null,
    tags: ['housing', 'sweden'],
    actions: {
      interesting: 'https://app.test/fika/act?t=int',
      notInteresting: 'https://app.test/fika/act?t=not',
      archive: 'https://app.test/fika/act?t=arc',
      read: 'https://app.test/fika/act?t=read',
    },
    openInAnsibleUrl: 'https://app.test/summaries#item-1',
    ...overrides,
  };
}

const base = {
  dateLabel: 'Saturday 6 September',
  week: { days: [true, true, true, false, false, false, false], count: 3, target: 5 },
  unreadCount: 41,
  settingsUrl: 'https://app.test/settings',
  sendTimeLabel: '07:00',
};

describe('renderFikaEmail', () => {
  it('uses the fixed subject and never puts titles in it', () => {
    const { subject } = renderFikaEmail({ ...base, items: [item()] });
    expect(subject).toBe(FIKA_SUBJECT);
    expect(subject).not.toContain('Stockholm');
  });

  it('renders two items with title, meta, summary, tags, four buttons and the Ansible link', () => {
    const second = item({ id: 'item-2', title: 'Second item', savedDaysAgo: 1, wordCount: null, author: null, tags: [] });
    const { html } = renderFikaEmail({ ...base, items: [item(), second] });

    expect(html).toContain('Why Stockholm&#39;s rental queue is 20 years long');
    expect(html).toContain('Anna Lindqvist &middot; Bloomberg &middot; 14 min read &middot; saved 47 days ago');
    expect(html).toContain('Second item');
    expect(html).toContain('saved yesterday');
    expect(html).not.toContain('null');
    expect(html).toContain('<li style="margin:0 0 8px;">Second <strong>point</strong></li>');
    expect(html).toContain('>housing</span>');
    expect(html).toContain('href="https://app.test/summaries#item-1"');
    expect((html.match(/💡&nbsp; Interesting/g) ?? []).length).toBe(2);
    expect((html.match(/📖&nbsp; Read in full/g) ?? []).length).toBe(2);
    expect(html).toContain('href="https://app.test/fika/act?t=arc"');
  });

  it('carries the titles in the hidden preheader and the fluid 600px container', () => {
    const { html } = renderFikaEmail({ ...base, items: [item()] });
    expect(html).toMatch(/display:none;[^>]*>Why Stockholm&#39;s rental queue/);
    expect(html).toContain('width:100%;max-width:600px');
    expect(html).not.toContain('width="600"');
  });

  it('prefers the prose summary when present', () => {
    const { html, text } = renderFikaEmail({
      ...base,
      items: [item({ proseSummary: 'Para one.\n\nPara two.', summaryMarkdown: '- bullets' })],
    });
    expect(html).toContain('<p style="margin:0 0 12px;">Para one.</p><p style="margin:0 0 12px;">Para two.</p>');
    expect(html).not.toContain('bullets');
    expect(text).toContain('Para one.');
  });

  it('escapes every model-generated field', () => {
    const { html } = renderFikaEmail({
      ...base,
      items: [
        item({
          title: '<script>x</script>',
          author: 'A & B',
          source: '"src"',
          tags: ['<b>'],
          summaryMarkdown: '- <img src=x>',
        }),
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;b&gt;');
  });

  it('renders the footer dots, the week line, the unread count and the send time', () => {
    const { html, text } = renderFikaEmail({ ...base, items: [item()] });
    expect(html).toContain('&#9679;&#9679;&#9679;</span>');
    expect(html).toContain('&#9675;&#9675;&#9675;&#9675;</span>');
    expect(html).toContain('3 of 5 reading days this week');
    expect(html).toContain('41 unread');
    expect(html).toContain('Sent at 07:00');
    expect(text).toContain('●●●○○○○ 3 of 5 reading days this week');
    expect(text).toContain('41 unread · Settings: https://app.test/settings');
  });

  it('produces a readable plain-text part with all four action links', () => {
    const { text } = renderFikaEmail({ ...base, items: [item()] });
    expect(text).toContain("1. Why Stockholm's rental queue is 20 years long");
    expect(text).toContain('- First point\n- Second point');
    expect(text).toContain('Tags: housing, sweden');
    expect(text).toContain('Archive:       https://app.test/fika/act?t=arc');
    expect(text).not.toContain('<');
  });

  it('says "your item" in the body for a one-item batch while the subject stays fixed', () => {
    const one = renderFikaEmail({ ...base, items: [item()] });
    expect(one.subject).toBe(FIKA_SUBJECT);
    expect(one.html).toContain('>Your item to go.<');
    expect(one.text).toContain('Your item to go.');
    const two = renderFikaEmail({ ...base, items: [item(), item({ id: 'item-2' })] });
    expect(two.html).toContain('>Your two items to go.<');
  });

  it('keeps the plain-text meta line free of HTML entities', () => {
    const { text, html } = renderFikaEmail({ ...base, items: [item({ author: "Conor O'Brien", source: 'Ars & Co' })] });
    expect(text).toContain("Conor O'Brien · Ars & Co · 14 min read · saved 47 days ago");
    expect(html).toContain('Conor O&#39;Brien &middot; Ars &amp; Co');
  });

  it('handles an item with no summary at all', () => {
    const { html } = renderFikaEmail({ ...base, items: [item({ summaryMarkdown: null })] });
    expect(html).toContain('Why Stockholm');
  });
});

describe('helpers', () => {
  it('computes reading minutes at 220 wpm with a floor of one', () => {
    expect(readingMinutes(3000)).toBe(14);
    expect(readingMinutes(50)).toBe(1);
    expect(readingMinutes(0)).toBeNull();
    expect(readingMinutes(null)).toBeNull();
  });

  it('labels saved-ago in plain words', () => {
    expect(savedAgoLabel(0)).toBe('saved today');
    expect(savedAgoLabel(1)).toBe('saved yesterday');
    expect(savedAgoLabel(12)).toBe('saved 12 days ago');
  });
});
