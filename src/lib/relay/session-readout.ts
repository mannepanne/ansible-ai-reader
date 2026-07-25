// ABOUT: Relay session readout — extracts what the orchestrator needs from a finished MA session
// ABOUT: the agent's closing text (the declined reason) and any mid-session fetch degradation

export interface MaContentBlock {
  type: string;
  text?: string;
}

export interface MaEvent {
  type: string;
  content?: MaContentBlock[];
  [k: string]: unknown;
}

// One research source the agent consulted this session — a verbatim quote + its URL. Stored on the
// decision (for BOTH writes and declines) so provenance survives even when no piece is written.
export interface SessionSource {
  quote: string;
  source_url: string;
  source_title: string;
}

export interface SessionReadout {
  // The agent's final message text — its closing reasoning (the 'reason' recorded for a silence).
  closingText: string | null;
  // 'summary_only' if a fetch degraded mid-session (the bridge marks it in the tool result JSON).
  degraded: string | null;
  // The research sources consulted this session, deduped by URL (empty if it did no grounded research).
  sources: SessionSource[];
}

function textOf(blocks: MaContentBlock[] | undefined): string {
  return (blocks ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
}

/**
 * Read a finished Managed Agent session's event list for the two things the decision-finalize step
 * needs from the transcript: the agent's closing text, and whether a fetch degraded. The verdict and
 * piece id are NOT read here — those come from DB state behind the bridge (the agent stays blind),
 * so this readout never has to detect write_pending or cross the agent's blindness boundary.
 */
// Pull research sources out of one tool-result payload. A research result is the only tool that
// returns an object with a `findings` array (recall returns a bare array; the rest return {ok}/{id}),
// so the shape identifies it without needing to correlate the preceding tool_use event.
function sourcesFrom(raw: string): SessionSource[] {
  try {
    const parsed = JSON.parse(raw) as { findings?: unknown };
    if (!parsed || !Array.isArray(parsed.findings)) return [];
    return (parsed.findings as Array<Record<string, unknown>>)
      .map((f) => ({
        quote: String(f?.quote ?? ''),
        source_url: String(f?.source_url ?? ''),
        source_title: String(f?.source_title ?? ''),
      }))
      .filter((f) => f.source_url);
  } catch {
    return [];
  }
}

export function readSession(events: MaEvent[]): SessionReadout {
  let closingText: string | null = null;
  // Degradation markers seen mid-session, surfaced on the decision so total-failure isn't silent:
  // 'summary_only' (a fetch fell back to stored content) and 'research_unavailable' (research fired but
  // came back empty/errored — e.g. the Perplexity key is unset). The latter distinguishes "research
  // failed" from "the agent chose not to research", which the empty-sources list alone cannot.
  const degradedMarkers = new Set<string>();
  const sources: SessionSource[] = [];
  const seenUrls = new Set<string>();

  for (const e of events ?? []) {
    if (e.type === 'agent.message') {
      const text = textOf(e.content);
      // Keep the last NON-EMPTY agent message: a trailing empty/tool-only turn must not blank it.
      if (text) {
        closingText = text;
      }
    } else if (e.type === 'agent.mcp_tool_result') {
      const raw = (e.content ?? []).map((b) => b.text ?? '').join('');
      if (raw.includes('"degraded":"summary_only"')) {
        degradedMarkers.add('summary_only');
      }
      if (raw.includes('"degraded":"research_unavailable"')) {
        degradedMarkers.add('research_unavailable');
      }
      for (const s of sourcesFrom(raw)) {
        if (!seenUrls.has(s.source_url)) {
          seenUrls.add(s.source_url);
          sources.push(s);
        }
      }
    }
  }

  const degraded = degradedMarkers.size ? [...degradedMarkers].join(',') : null;
  return { closingText, degraded, sources };
}

interface MaToolUseEvent extends MaEvent {
  name?: string;
  input?: Record<string, unknown>;
  is_error?: boolean;
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

// recall returns a JSON array of {id, kind, title, ...}; pull the titles for the trace.
function recallTitles(raw: string): string[] | null {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.map((r) => r?.title || `${r?.kind ?? '?'}:${String(r?.id ?? '').slice(0, 8)}`);
    }
  } catch {
    /* not a JSON array — fall through */
  }
  return null;
}

/**
 * Render a human-readable reasoning trace from a session's events: the recall queries the narrator
 * composed (its thinking made visible — what concepts it reached for), the neighbours it got back,
 * any fetches, its interim narration, and whether it wrote or stayed silent. The raw chain-of-thought
 * is not in the event stream (agent.thinking carries no text), so the queries and interim messages
 * are the window into how it decided.
 */
export function renderTrace(events: MaEvent[]): string {
  const lines: string[] = [];
  for (const e of events ?? []) {
    if (e.type === 'agent.thinking') {
      lines.push('  · thinking…');
    } else if (e.type === 'agent.mcp_tool_use') {
      const ev = e as MaToolUseEvent;
      const input = ev.input ?? {};
      if (ev.name === 'recall') {
        const k = input.k ? ` (k=${input.k})` : '';
        lines.push(`  → recall   "${truncate(String(input.stimulus_text ?? ''), 110)}"${k}`);
      } else if (ev.name === 'fetch') {
        lines.push(`  → fetch    ${String(input.id ?? '')}`);
      } else if (ev.name === 'write_pending') {
        const body = String(input.body ?? '');
        const firstLine = body.split('\n').find((l) => l.trim()) ?? body;
        lines.push(`  → write_pending   "${truncate(firstLine, 80)}"`);
      } else {
        lines.push(`  → ${ev.name ?? '?'}   ${truncate(JSON.stringify(input), 80)}`);
      }
    } else if (e.type === 'agent.mcp_tool_result') {
      const raw = (e.content ?? []).map((b) => b.text ?? '').join('');
      if ((e as MaToolUseEvent).is_error) {
        lines.push(`    ← ERROR: ${truncate(raw, 120)}`);
      } else {
        const titles = recallTitles(raw);
        if (titles) {
          lines.push(`    ← ${titles.length} neighbour(s): ${truncate(titles.join('; '), 160)}`);
        } else if (raw.includes('"ok":true')) {
          lines.push('    ← ok');
        } else if (raw) {
          lines.push(`    ← ${truncate(raw, 120)}`);
        }
      }
    } else if (e.type === 'agent.message') {
      const text = textOf(e.content);
      if (text) lines.push(`  💬 ${text}`);
    }
  }
  return lines.join('\n');
}

// Per-session token totals recorded on the run ledger for cost/cache observability. Names mirror the
// Managed-Agent session .usage payload; cache_creation is collapsed from its two TTL buckets into one.
export interface SessionUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Normalize a finished session's server-computed `.usage` (from GET /v1/sessions/{id}) into flat token
 * totals for the ledger. This is the canonical per-session cost — the server already sums across every
 * model turn, so it equals the sum of the session's span.model_request_end model_usage blocks. cache
 * creation is reported split by TTL bucket (ephemeral_5m + ephemeral_1h); the two are collapsed here (a
 * flat cache_creation_input_tokens, the span-event shape, is also accepted). Returns null when usage is
 * absent or carries no recognisable token field, so the ledger stores NULL — "not measured" — rather
 * than a misleading zero (mirrors how the codebase treats NULL as "not evaluated").
 */
export function readUsage(usage: unknown): SessionUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  const cc = u.cache_creation && typeof u.cache_creation === 'object' ? (u.cache_creation as Record<string, unknown>) : {};
  const cacheCreation =
    typeof u.cache_creation_input_tokens === 'number'
      ? num(u.cache_creation_input_tokens)
      : num(cc.ephemeral_5m_input_tokens) + num(cc.ephemeral_1h_input_tokens);

  const hasAny =
    typeof u.input_tokens === 'number' ||
    typeof u.output_tokens === 'number' ||
    typeof u.cache_read_input_tokens === 'number' ||
    typeof u.cache_creation_input_tokens === 'number' ||
    typeof cc.ephemeral_5m_input_tokens === 'number' ||
    typeof cc.ephemeral_1h_input_tokens === 'number';
  if (!hasAny) return null;

  return {
    input_tokens: num(u.input_tokens),
    output_tokens: num(u.output_tokens),
    cache_read_input_tokens: num(u.cache_read_input_tokens),
    cache_creation_input_tokens: cacheCreation,
  };
}
