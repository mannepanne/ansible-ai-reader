// ABOUT: Renders the Fika email with sample content to fika-preview.html for review in a browser
// ABOUT: Usage: npm run fika:preview — the template is the one thing CI cannot verify, so look before you ship

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { renderFikaEmail } from '../src/lib/fika/email';

const site = 'https://ansible.hultberg.org';
const link = (n: string) => `${site}/fika/act?t=sample-${n}`;

const email = renderFikaEmail({
  dateLabel: 'Saturday 6 September',
  week: { days: [true, true, true, false, false, false, false], count: 3, target: 5 },
  unreadCount: 41,
  settingsUrl: `${site}/settings`,
  sendTimeLabel: '07:00',
  items: [
    {
      id: 'sample-1',
      title: "Why Stockholm's rental queue is 20 years long",
      url: 'https://example.com/stockholm-rental-queue',
      author: 'Anna Lindqvist',
      source: 'Bloomberg',
      wordCount: 3000,
      savedDaysAgo: 47,
      summaryMarkdown: [
        "- Stockholm's municipal housing queue has passed 700,000 registrants; the average wait for an inner-city flat is now over 20 years.",
        '- Rents are set in annual negotiations between landlords and the tenants\' union, which keeps regulated rents 40 to 60 percent below market in central districts.',
        '- The gap sustains a large secondary market: sublets, black-market contract trades, and "renovictions" where landlords renovate to reset rents.',
        '- New-build flats have been exempt from regulation since 2013 but are priced beyond most queue members, so supply grows without relieving the queue.',
        '- The 2021 government collapse over freeing new-build rents shows how politically locked the system is.',
        "- Author's position: the queue is a pricing mechanism, not a shortage. The fix is gradual rent convergence with income-linked support, not building alone.",
      ].join('\n'),
      proseSummary: null,
      tags: ['housing', 'sweden', 'economics', 'policy'],
      actions: { interesting: link('1i'), notInteresting: link('1n'), archive: link('1a'), read: link('1r') },
      openInAnsibleUrl: `${site}/summaries#sample-1`,
    },
    {
      id: 'sample-2',
      title: 'What 30 million features taught Anthropic about how models think',
      url: 'https://example.com/30-million-features',
      author: null,
      source: 'Ars Technica',
      wordCount: 1900,
      savedDaysAgo: 2,
      summaryMarkdown: [
        '- Sparse autoencoders trained on a mid-sized model surfaced about 30 million interpretable features, from "Golden Gate Bridge" to "code with a security flaw".',
        '- Features are multilingual and multimodal: the same feature fires for a concept in text and in images.',
        '- Steering a single feature changes behaviour predictably, which the team frames as an early safety tool rather than a finished one.',
        '- Most features remain uninterpreted, and the method captures only a fraction of what the model computes.',
        '- The piece is careful about what this proves: an inventory of concepts is not an explanation of reasoning.',
      ].join('\n'),
      proseSummary: null,
      tags: ['ai', 'interpretability', 'anthropic', 'research'],
      actions: { interesting: link('2i'), notInteresting: link('2n'), archive: link('2a'), read: link('2r') },
      openInAnsibleUrl: `${site}/summaries#sample-2`,
    },
  ],
});

const chrome = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fika preview</title></head>
<body style="margin:0;background:#eceded;">
<div style="max-width:600px;margin:0 auto;padding:16px 20px 0;font:13px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#5c6167;">
  <div><b style="color:#212529;">From:</b> Ansible &lt;fika@ansible.hultberg.org&gt;</div>
  <div><b style="color:#212529;">Subject:</b> ${email.subject}</div>
  <div style="margin-top:6px;font-size:12px;color:#868e96;">Preview with sample content. Everything below this line is the email as it would ship.</div>
</div>
${email.html}
<pre style="max-width:600px;margin:24px auto;padding:16px;background:#fff;border:1px solid #dee2e6;font-size:12px;white-space:pre-wrap;">${email.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
</body></html>`;

const out = resolve(process.cwd(), 'fika-preview.html');
writeFileSync(out, chrome);
console.log(`Wrote ${out}`);
