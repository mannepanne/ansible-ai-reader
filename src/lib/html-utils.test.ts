// ABOUT: Tests for HTML utility functions
// ABOUT: Validates HTML stripping, entity decoding, and security

import { describe, it, expect } from 'vitest';
import { stripHtml } from './html-utils';

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello World</p>')).toBe('Hello World');
    expect(stripHtml('<div><span>Nested</span> content</div>')).toBe(
      'Nested content'
    );
  });

  it('removes script tags (security)', () => {
    expect(stripHtml('<script>alert("xss")</script>Hello')).toBe('Hello');
    expect(
      stripHtml('<script src="evil.js"></script>Safe content<script>bad()</script>')
    ).toBe('Safe content');
    expect(
      stripHtml('<p>Good</p> <script>alert(1)</script> <p>Content</p>')
    ).toBe('Good Content');
  });

  it('removes style tags', () => {
    expect(stripHtml('<style>.class { color: red; }</style>Content')).toBe(
      'Content'
    );
    expect(stripHtml('<p>Text</p><style>body { margin: 0; }</style> <p>More</p>')).toBe(
      'Text More'
    );
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp;')).toBe('&');
    expect(stripHtml('&lt;')).toBe('<');
    expect(stripHtml('&gt;')).toBe('>');
    expect(stripHtml('&quot;')).toBe('"');
    expect(stripHtml('&#39;')).toBe("'");
    expect(stripHtml('Hello&nbsp;World')).toBe('Hello World');
  });

  it('decodes combined entities', () => {
    expect(stripHtml('&amp;&lt;&gt;&quot;&#39;')).toBe('&<>"\'');
    expect(stripHtml('AT&amp;T')).toBe('AT&T');
  });

  it('normalizes whitespace', () => {
    expect(stripHtml('Hello   World')).toBe('Hello World');
    expect(stripHtml('Hello\n\nWorld')).toBe('Hello World');
    expect(stripHtml('Hello\t\tWorld')).toBe('Hello World');
    expect(stripHtml('  Hello  World  ')).toBe('Hello World');
  });

  it('handles complex HTML with nested tags', () => {
    const html = `
      <div class="article">
        <h1>Title</h1>
        <p>First paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
        <p>Second paragraph.</p>
      </div>
    `;
    expect(stripHtml(html)).toBe(
      'Title First paragraph with bold and italic text. Second paragraph.'
    );
  });

  it('handles HTML with entities and tags combined', () => {
    const html = '<p>AT&amp;T &lt;strong&gt;</p>';
    expect(stripHtml(html)).toBe('AT&T <strong>');
  });

  it('handles empty and whitespace-only strings', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml('   ')).toBe('');
    expect(stripHtml('\n\n  \t  \n')).toBe('');
  });

  it('handles real-world article HTML', () => {
    const html = `
      <article>
        <h1>The Future of AI</h1>
        <p class="byline">By John Doe</p>
        <p>Artificial intelligence is transforming the way we work&nbsp;&amp;&nbsp;live.</p>
        <script>trackPageView();</script>
        <style>.highlight { background: yellow; }</style>
        <p>The impact will be <strong>significant</strong> in coming years.</p>
      </article>
    `;
    const result = stripHtml(html);
    expect(result).toBe(
      'The Future of AI By John Doe Artificial intelligence is transforming the way we work & live. The impact will be significant in coming years.'
    );
    // Verify no script content leaked through
    expect(result).not.toContain('trackPageView');
    expect(result).not.toContain('.highlight');
  });

  it('protects against script injection in attributes', () => {
    const html = '<img src="x" onerror="alert(1)">Safe text';
    const result = stripHtml(html);
    expect(result).toBe('Safe text');
    expect(result).not.toContain('alert');
  });

  it('handles malformed HTML gracefully', () => {
    expect(stripHtml('<p>Unclosed tag')).toBe('Unclosed tag');
    expect(stripHtml('No tags at all')).toBe('No tags at all');
    expect(stripHtml('< broken > tag')).toBe('tag');
  });
});
