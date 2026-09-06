// ABOUT: Escaping and a small allowlist markdown renderer for email bodies
// ABOUT: Summaries are model-generated text; everything is escaped first, then a few markdown forms are re-enabled

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/;

/** Inline markdown on already-escaped text: links (http/https only), bold, emphasis */
export function renderInline(escaped: string): string {
  let out = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const decoded = url.replace(/&amp;/g, '&');
    if (!SAFE_URL.test(decoded)) return match;
    return `<a href="${escapeHtml(decoded)}" style="color:#0d6efd;text-decoration:none;">${label}</a>`;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?=[^_\w]|$)/g, '$1<em>$2</em>');
  return out;
}

const LI_STYLE = 'margin:0 0 8px;';
const UL_STYLE = 'margin:0 0 12px;padding:0 0 0 22px;';
const P_STYLE = 'margin:0 0 12px;';

/**
 * Renders summary markdown to inline-styled HTML. Supports paragraphs, `-`/`*`/`•` bullets,
 * numbered lists, and `#` headings (rendered as a bold paragraph). Everything else is text.
 */
export function renderSummaryHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (list) {
      const items = list.items.map((i) => `<li style="${LI_STYLE}">${i}</li>`).join('');
      blocks.push(`<${list.tag} style="${UL_STYLE}">${items}</${list.tag}>`);
      list = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p style="${P_STYLE}">${paragraph.join(' ')}</p>`);
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushList();
      flushParagraph();
      blocks.push(`<p style="${P_STYLE}"><strong>${renderInline(escapeHtml(heading[1]))}</strong></p>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      const text = renderInline(escapeHtml((bullet ?? numbered)![1]));
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(text);
    } else {
      flushList();
      paragraph.push(renderInline(escapeHtml(line)));
    }
  }
  flushList();
  flushParagraph();
  return blocks.join('');
}

/** Plain-text rendering for the text/plain alternative: strips markdown marks, keeps bullets */
export function renderSummaryText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((raw) => {
      const line = raw.trim();
      if (!line) return '';
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) return heading[1].toUpperCase();
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      const body = bullet ? `- ${bullet[1]}` : line;
      return body
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1$2');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Prose (spec 14) arrives as plain paragraphs separated by blank lines */
export function renderProseHtml(prose: string): string {
  return prose
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${P_STYLE}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
