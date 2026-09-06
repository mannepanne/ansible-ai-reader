// ABOUT: Renders the Fika email (HTML + plain text) from already-selected items
// ABOUT: Pure: takes URLs and labels as input, matches the agreed preview, inline styles only

import { escapeHtml, renderSummaryHtml, renderSummaryText, renderProseHtml } from './markdown';

export const FIKA_SUBJECT = 'Ansible Fika: Your two items to go';
export const WORDS_PER_MINUTE = 220;

export interface FikaEmailItem {
  id: string;
  title: string;
  url: string;
  author: string | null;
  source: string | null;
  wordCount: number | null;
  /** Days since the item was saved, in the user's local calendar */
  savedDaysAgo: number;
  summaryMarkdown: string | null;
  proseSummary: string | null;
  tags: string[];
  actions: { interesting: string; notInteresting: string; archive: string; read: string };
  openInAnsibleUrl: string;
}

export interface FikaEmailInput {
  items: FikaEmailItem[];
  /** e.g. "Saturday 6 September" */
  dateLabel: string;
  week: { days: boolean[]; count: number; target: number };
  unreadCount: number;
  settingsUrl: string;
  /** e.g. "07:00" */
  sendTimeLabel: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BUTTON_STYLE =
  'display:block;padding:13px 10px;border:1px solid #ced4da;border-radius:6px;background:#ffffff;color:#212529;font-size:15px;font-weight:600;text-align:center;text-decoration:none;';
const PILL_STYLE = 'display:inline-block;background:#eef0f2;border-radius:10px;padding:1px 9px;margin:0 4px 4px 0;';

export function readingMinutes(wordCount: number | null): number | null {
  if (wordCount === null || wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

export function savedAgoLabel(days: number): string {
  if (days <= 0) return 'saved today';
  if (days === 1) return 'saved yesterday';
  return `saved ${days} days ago`;
}

/** Unescaped meta parts; the HTML path escapes, the text path uses them as they are */
function metaParts(item: FikaEmailItem): string[] {
  const parts: string[] = [];
  if (item.author) parts.push(item.author);
  if (item.source) parts.push(item.source);
  const minutes = readingMinutes(item.wordCount);
  if (minutes !== null) parts.push(`${minutes} min read`);
  parts.push(savedAgoLabel(item.savedDaysAgo));
  return parts;
}

export function headingFor(itemCount: number): string {
  return itemCount === 1 ? 'Your item to go.' : 'Your two items to go.';
}

function button(href: string, label: string): string {
  return `<td width="50%" style="padding:6px;"><a href="${escapeHtml(href)}" style="${BUTTON_STYLE}">${label}</a></td>`;
}

function renderItemHtml(item: FikaEmailItem): string {
  const meta = metaParts(item).map(escapeHtml).join(' &middot; ');
  const body = item.proseSummary
    ? renderProseHtml(item.proseSummary)
    : renderSummaryHtml(item.summaryMarkdown ?? '');
  const tags = item.tags.map((t) => `<span style="${PILL_STYLE}">${escapeHtml(t)}</span>`).join('');

  return `
  <tr><td style="padding:0 0 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #dee2e6;border-radius:6px;">
      <tr><td style="padding:22px 22px 8px;">
        <a href="${escapeHtml(item.url)}" style="font-size:20px;line-height:1.3;font-weight:700;color:#0d6efd;text-decoration:none;">${escapeHtml(item.title)}</a>
      </td></tr>
      <tr><td style="padding:0 22px 14px;font-size:14px;line-height:1.5;color:#6c757d;">
        ${meta} &middot; <a href="${escapeHtml(item.openInAnsibleUrl)}" style="color:#0d6efd;text-decoration:none;">Open in Ansible</a>
      </td></tr>
      <tr><td style="padding:0 22px 6px;font-size:17px;line-height:1.55;color:#212529;">${body}</td></tr>
      ${tags ? `<tr><td style="padding:10px 22px 16px;font-size:13px;line-height:1.6;color:#6c757d;">${tags}</td></tr>` : ''}
      <tr><td style="padding:0 16px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${button(item.actions.interesting, '💡&nbsp; Interesting')}${button(item.actions.notInteresting, '🤷&nbsp; Not for me')}</tr>
          <tr>${button(item.actions.archive, '📦&nbsp; Archive')}${button(item.actions.read, '📖&nbsp; Read in full')}</tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

function renderDots(days: boolean[]): string {
  const filled = days.filter(Boolean).length;
  const empty = days.length - filled;
  return (
    `<span style="font-size:15px;letter-spacing:2px;color:#212529;">${'&#9679;'.repeat(filled)}</span>` +
    `<span style="font-size:15px;letter-spacing:2px;color:#adb5bd;">${'&#9675;'.repeat(empty)}</span>`
  );
}

function renderItemText(item: FikaEmailItem): string {
  const meta = metaParts(item).join(' · ');
  const body = item.proseSummary ? item.proseSummary.trim() : renderSummaryText(item.summaryMarkdown ?? '');
  const lines = [
    item.title,
    item.url,
    meta,
    `Open in Ansible: ${item.openInAnsibleUrl}`,
    '',
    body,
    '',
    item.tags.length ? `Tags: ${item.tags.join(', ')}` : '',
    `Interesting:   ${item.actions.interesting}`,
    `Not for me:    ${item.actions.notInteresting}`,
    `Archive:       ${item.actions.archive}`,
    `Read in full:  ${item.actions.read}`,
  ];
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

export function renderFikaEmail(input: FikaEmailInput): RenderedEmail {
  const preheader = input.items.map((i) => escapeHtml(i.title)).join(' &middot; ');
  const weekLine = `${input.week.count} of ${input.week.target} reading days this week`;
  const unreadLine = `${input.unreadCount} unread`;

  const html = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2;margin:0;padding:0;table-layout:fixed;">
<tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${FONT};color:#212529;">
  <tr><td style="padding:0 4px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:15px;font-weight:700;color:#212529;">Ansible <span style="color:#6c757d;font-weight:500;">Fika</span></td>
        <td align="right" style="font-size:13px;color:#6c757d;">${escapeHtml(input.dateLabel)}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 4px 18px;font-size:22px;line-height:1.3;font-weight:700;color:#212529;">${headingFor(input.items.length)}</td></tr>
${input.items.map(renderItemHtml).join('')}
  <tr><td align="center" style="padding:10px 4px 0;font-size:13px;line-height:1.7;color:#6c757d;">
    ${renderDots(input.week.days)}&nbsp; ${weekLine}<br>
    ${unreadLine} &middot; <a href="${escapeHtml(input.settingsUrl)}" style="color:#0d6efd;text-decoration:none;">Settings</a>
  </td></tr>
  <tr><td align="center" style="padding:14px 4px 0;font-size:12px;line-height:1.5;color:#adb5bd;">
    Sent at ${escapeHtml(input.sendTimeLabel)} because Fika is on in your Ansible settings.
  </td></tr>
</table>
</td></tr>
</table>`;

  const text = [
    `Ansible Fika — ${input.dateLabel}`,
    headingFor(input.items.length),
    '',
    ...input.items.map((item, i) => `${i + 1}. ${renderItemText(item)}\n`),
    `${input.week.days.map((d) => (d ? '●' : '○')).join('')} ${weekLine}`,
    `${unreadLine} · Settings: ${input.settingsUrl}`,
    `Sent at ${input.sendTimeLabel} because Fika is on in your Ansible settings.`,
  ].join('\n');

  return { subject: FIKA_SUBJECT, html, text };
}
