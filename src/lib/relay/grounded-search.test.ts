// ABOUT: Tests for grounded-search — the bridge's verbatim-snippet fact-finder over Perplexity sonar
// ABOUT: Asserts the search_results→findings mapping, fail-closed behaviour, and trusted-source steering

import { describe, it, expect, vi } from 'vitest';
import { groundedSearch, RESEARCH_UNAVAILABLE, MAX_RESEARCH_K } from './grounded-search';

// A sonar response shaped like the real API: search_results[] carry verbatim `snippet` + `url` + `title`.
function sonarResponse(results: Array<{ snippet?: string; url?: string; title?: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: 'x',
      model: 'sonar',
      choices: [{ index: 0, message: { role: 'assistant', content: 'prose we deliberately ignore [1]' } }],
      citations: results.map((r) => r.url),
      search_results: results,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  } as unknown as Response;
}

const fetchOk = (results: Parameters<typeof sonarResponse>[0]) => vi.fn().mockResolvedValue(sonarResponse(results));

describe('groundedSearch', () => {
  it('maps search_results snippets to verbatim findings (never the model prose)', async () => {
    const fetchImpl = fetchOk([
      { snippet: 'Fines of up to 35 million euros.', url: 'https://a.example/eu', title: 'EU AI Act penalties' },
      { snippet: 'Second verbatim extract.', url: 'https://b.example/x', title: 'Second source' },
    ]);
    const res = await groundedSearch({ apiKey: 'k', fetchImpl }, { query: 'EU AI Act penalty ceiling' });
    expect(res.degraded).toBeUndefined();
    expect(res.findings).toEqual([
      { quote: 'Fines of up to 35 million euros.', source_url: 'https://a.example/eu', source_title: 'EU AI Act penalties' },
      { quote: 'Second verbatim extract.', source_url: 'https://b.example/x', source_title: 'Second source' },
    ]);
  });

  it('drops results with no snippet or no url (unusable as grounding)', async () => {
    const fetchImpl = fetchOk([
      { snippet: '', url: 'https://a.example', title: 'no snippet' },
      { snippet: 'good', url: '', title: 'no url' },
      { snippet: 'kept', url: 'https://c.example', title: 'ok' },
    ]);
    const res = await groundedSearch({ apiKey: 'k', fetchImpl }, { query: 'q' });
    expect(res.findings).toEqual([{ quote: 'kept', source_url: 'https://c.example', source_title: 'ok' }]);
  });

  it('clamps k to the ceiling', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ snippet: `s${i}`, url: `https://x.example/${i}`, title: `t${i}` }));
    const res = await groundedSearch({ apiKey: 'k', fetchImpl: fetchOk(many) }, { query: 'q', k: 999 });
    expect(res.findings).toHaveLength(MAX_RESEARCH_K);
  });

  it('fails CLOSED on an empty result set (degraded, no findings)', async () => {
    const res = await groundedSearch({ apiKey: 'k', fetchImpl: fetchOk([]) }, { query: 'q' });
    expect(res.findings).toEqual([]);
    expect(res.degraded).toBe(RESEARCH_UNAVAILABLE);
  });

  it('fails CLOSED on a non-ok HTTP status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as unknown as Response);
    const res = await groundedSearch({ apiKey: 'k', fetchImpl }, { query: 'q' });
    expect(res.findings).toEqual([]);
    expect(res.degraded).toBe(RESEARCH_UNAVAILABLE);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 401 is not retried
  });

  it('fails CLOSED on a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await groundedSearch({ apiKey: 'k', fetchImpl }, { query: 'q' });
    expect(res.findings).toEqual([]);
    expect(res.degraded).toBe(RESEARCH_UNAVAILABLE);
  });

  it('retries once on a 5xx, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce(sonarResponse([{ snippet: 'ok', url: 'https://a.example', title: 't' }]));
    const res = await groundedSearch({ apiKey: 'k', fetchImpl }, { query: 'q' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.findings).toEqual([{ quote: 'ok', source_url: 'https://a.example', source_title: 't' }]);
  });

  it('steers toward trusted sources in the prompt without hard-filtering', async () => {
    const fetchImpl = fetchOk([{ snippet: 'x', url: 'https://a.example', title: 't' }]);
    await groundedSearch(
      { apiKey: 'k', fetchImpl, trustedSources: ['reuters.com', 'ft.com'] },
      { query: 'q' },
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    const system = body.messages.find((m: { role: string }) => m.role === 'system').content as string;
    expect(system).toContain('reuters.com');
    expect(system).toContain('ft.com');
    // No hard domain filter — facts may come from across the spectrum (north-star).
    expect(body.search_domain_filter).toBeUndefined();
  });

  it('throws on programmer error (missing query)', async () => {
    await expect(groundedSearch({ apiKey: 'k', fetchImpl: fetchOk([]) }, { query: '  ' })).rejects.toThrow(/query/);
  });
});
