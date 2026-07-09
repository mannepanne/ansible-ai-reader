// ABOUT: Relay grounded-search — verbatim, source-attributable findings from Perplexity sonar
// ABOUT: Reads sonar's search_results[] (index snippets + url), NEVER the model's prose, and fails closed

import { z } from 'zod';

// One grounded finding: a verbatim span extracted from a source page (Perplexity's search index),
// paired with the URL it came from. This is what makes grounding real rather than "trust a second
// Perplexity paraphrase" — the quote is the source's own words, and source_url is human-checkable.
export interface Finding {
  quote: string;
  source_url: string;
  source_title: string;
}

export interface GroundedSearchResult {
  findings: Finding[];
  // Set (with an empty findings list) whenever research could not produce grounded facts — an API
  // error, a timeout, or an empty result set. The caller must then fail CLOSED (hedge or stay silent),
  // never assert an ungrounded specific.
  degraded?: string;
}

export interface GroundedSearchDeps {
  apiKey: string;
  // Injected for tests; the bridge passes global fetch.
  fetchImpl?: typeof fetch;
  // Outlets to prefer when several sources cover the question (soft prompt steering, not a hard filter).
  trustedSources?: string[];
}

export const DEFAULT_RESEARCH_K = 5;
export const MAX_RESEARCH_K = 10;
export const RESEARCH_UNAVAILABLE = 'research_unavailable';

// Bounds chosen to stay inside the Managed-Agent per-tool-call timeout (research holds the MCP request
// open while the agent blocks). Worst case: 2 attempts × 25s = 50s, then fail closed. No backoff sleeps
// between attempts — they would only push us further toward that ceiling for no reliability gain here.
const MAX_ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 25_000;

// A sonar response schema that PRESERVES search_results (the standard summary path's
// PerplexityResponseSchema strips them). Lenient + passthrough: an unexpected shape parses to an empty
// search_results and degrades gracefully rather than crashing the session.
const SonarResponseSchema = z
  .object({
    search_results: z
      .array(
        z
          .object({
            title: z.string().optional(),
            url: z.string().optional(),
            snippet: z.string().optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

function clampK(k: unknown): number {
  const n = typeof k === 'number' && Number.isFinite(k) ? Math.floor(k) : DEFAULT_RESEARCH_K;
  return Math.min(Math.max(n, 1), MAX_RESEARCH_K);
}

function systemPrompt(trusted?: string[]): string {
  const base =
    'You are a fact-finding research assistant. Search the web for precise, verifiable facts and cite your sources. Be concise.';
  if (trusted?.length) {
    return `${base} When several sources cover the question, prefer these reliable outlets: ${trusted.join(
      ', ',
    )}. But always include the single most authoritative source even if it is not in that list.`;
  }
  return base;
}

async function callSonar(deps: GroundedSearchDeps, query: string): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = {
    model: 'sonar',
    messages: [
      { role: 'system', content: systemPrompt(deps.trustedSources) },
      { role: 'user', content: query },
    ],
    // We discard the prose entirely (only search_results matter), so keep generation cheap.
    max_tokens: 256,
    temperature: 0.1,
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      // A rejected fetch (network error / timeout abort) is transient — retry under the cap.
      clearTimeout(timer);
      lastErr = e;
      if (attempt === MAX_ATTEMPTS) throw e;
      continue;
    }
    clearTimeout(timer);
    // Retry only the transient statuses (rate limit / server error); a 4xx is terminal (no retry).
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`sonar transient ${res.status}`);
      if (attempt === MAX_ATTEMPTS) throw lastErr;
      continue;
    }
    if (!res.ok) throw new Error(`sonar ${res.status}`);
    return await res.json();
  }
  throw lastErr ?? new Error('sonar: retries exhausted');
}

/**
 * Fact-finding search: one sonar call, mapping its search_results to verbatim findings. Fails CLOSED —
 * any error, timeout, or empty result set returns `{ findings: [], degraded }` so the narrator hedges
 * or stays silent rather than asserting an ungrounded specific. Throws only on programmer error
 * (missing apiKey/query), which the tool layer validates before calling.
 */
export async function groundedSearch(
  deps: GroundedSearchDeps,
  args: { query: string; k?: number },
): Promise<GroundedSearchResult> {
  const query = args?.query?.trim();
  if (!query) throw new Error('groundedSearch: query is required');
  if (!deps.apiKey) throw new Error('groundedSearch: apiKey is required');
  const k = clampK(args?.k);

  let data: unknown;
  try {
    data = await callSonar(deps, query);
  } catch {
    return { findings: [], degraded: RESEARCH_UNAVAILABLE };
  }

  let parsed: z.infer<typeof SonarResponseSchema>;
  try {
    parsed = SonarResponseSchema.parse(data);
  } catch {
    return { findings: [], degraded: RESEARCH_UNAVAILABLE };
  }

  const findings: Finding[] = parsed.search_results
    .map((r) => ({
      quote: (r.snippet ?? '').trim(),
      source_url: (r.url ?? '').trim(),
      source_title: (r.title ?? '').trim(),
    }))
    .filter((f) => f.quote && f.source_url)
    .slice(0, k);

  if (findings.length === 0) return { findings: [], degraded: RESEARCH_UNAVAILABLE };
  return { findings };
}
