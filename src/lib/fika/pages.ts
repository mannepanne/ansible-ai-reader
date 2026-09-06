// ABOUT: Standalone HTML pages returned by the Fika action endpoint (confirmation and friendly errors)
// ABOUT: One glance and done: brand, one line, one link; same look as the app card

import { escapeHtml } from './markdown';

export interface FikaPageInput {
  heading: string;
  detail?: string | null;
  itemTitle?: string | null;
  linkHref: string;
  linkLabel: string;
  tone?: 'ok' | 'error';
}

export function renderFikaPage(input: FikaPageInput): string {
  const tone = input.tone ?? 'ok';
  const accent = tone === 'ok' ? '#198754' : '#6c757d';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.heading)} · Ansible Fika</title>
<meta name="robots" content="noindex">
</head>
<body style="margin:0;background:#f4f4f2;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#212529;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">
  <div style="font-size:15px;font-weight:700;margin:0 4px 14px;">Ansible <span style="color:#6c757d;font-weight:500;">Fika</span></div>
  <div style="background:#fff;border:1px solid #dee2e6;border-radius:6px;padding:22px;">
    <div style="font-size:20px;font-weight:700;line-height:1.3;color:${accent};margin:0 0 8px;">${escapeHtml(input.heading)}</div>
    ${input.itemTitle ? `<div style="font-size:17px;line-height:1.4;margin:0 0 8px;">${escapeHtml(input.itemTitle)}</div>` : ''}
    ${input.detail ? `<div style="font-size:14px;line-height:1.5;color:#6c757d;margin:0 0 16px;">${escapeHtml(input.detail)}</div>` : '<div style="height:8px;"></div>'}
    <a href="${escapeHtml(input.linkHref)}" style="display:inline-block;padding:11px 16px;border:1px solid #ced4da;border-radius:6px;color:#212529;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(input.linkLabel)}</a>
  </div>
</div>
</body>
</html>`;
}
