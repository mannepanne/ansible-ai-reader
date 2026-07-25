// ABOUT: Tests for Relay session readout — what the orchestrator extracts from a finished MA session
// ABOUT: the agent's closing text (the declined reason) and any mid-session fetch degradation

import { describe, it, expect } from 'vitest';
import { readSession, renderTrace, readUsage } from './session-readout';

describe('readSession', () => {
  it('returns the last agent.message text as the closing text', () => {
    const events = [
      { type: 'agent.message', content: [{ type: 'text', text: 'thinking out loud' }] },
      { type: 'agent.mcp_tool_use', name: 'recall' },
      { type: 'agent.message', content: [{ type: 'text', text: 'This earns no piece: nothing new here.' }] },
    ];
    expect(readSession(events).closingText).toBe('This earns no piece: nothing new here.');
  });

  it('joins multiple text blocks within the closing message', () => {
    const events = [
      { type: 'agent.message', content: [{ type: 'text', text: 'line 1' }, { type: 'text', text: 'line 2' }] },
    ];
    expect(readSession(events).closingText).toBe('line 1\nline 2');
  });

  it('detects a degraded fetch from the bridge tool result content', () => {
    const events = [
      {
        type: 'agent.mcp_tool_result',
        content: [{ type: 'text', text: '{"id":"x","kind":"reference","text":"...","degraded":"summary_only"}' }],
      },
      { type: 'agent.message', content: [{ type: 'text', text: 'done' }] },
    ];
    expect(readSession(events).degraded).toBe('summary_only');
  });

  it('returns nulls when there is no agent message or degradation', () => {
    expect(readSession([{ type: 'session.status_idle' }])).toEqual({ closingText: null, degraded: null, sources: [] });
  });

  it('ignores non-text content blocks and does not let an empty trailing message clear the closing text', () => {
    const events = [
      { type: 'agent.message', content: [{ type: 'thinking', text: 'hmm' }] },
      { type: 'agent.message', content: [{ type: 'text', text: 'real close' }] },
      { type: 'agent.message', content: [] },
    ];
    expect(readSession(events).closingText).toBe('real close');
  });

  it('tolerates a missing or empty events array', () => {
    expect(readSession(undefined as never)).toEqual({ closingText: null, degraded: null, sources: [] });
    expect(readSession([])).toEqual({ closingText: null, degraded: null, sources: [] });
  });

  it('extracts research sources from a research tool result (findings array)', () => {
    const events = [
      {
        type: 'agent.mcp_tool_result',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              findings: [
                { quote: 'Fines up to 35m euros.', source_url: 'https://a.example', source_title: 'A' },
                { quote: 'Second fact.', source_url: 'https://b.example', source_title: 'B' },
              ],
            }),
          },
        ],
      },
      { type: 'agent.message', content: [{ type: 'text', text: 'wrote something' }] },
    ];
    expect(readSession(events).sources).toEqual([
      { quote: 'Fines up to 35m euros.', source_url: 'https://a.example', source_title: 'A' },
      { quote: 'Second fact.', source_url: 'https://b.example', source_title: 'B' },
    ]);
  });

  it('dedups research sources by URL across multiple research calls, and ignores non-research results', () => {
    const events = [
      { type: 'agent.mcp_tool_result', content: [{ type: 'text', text: '[{"id":"1","kind":"reference","title":"recall hit"}]' }] },
      {
        type: 'agent.mcp_tool_result',
        content: [{ type: 'text', text: JSON.stringify({ findings: [{ quote: 'q1', source_url: 'https://a.example', source_title: 'A' }] }) }],
      },
      {
        type: 'agent.mcp_tool_result',
        content: [{ type: 'text', text: JSON.stringify({ findings: [{ quote: 'again', source_url: 'https://a.example', source_title: 'A' }] }) }],
      },
    ];
    expect(readSession(events).sources).toEqual([{ quote: 'q1', source_url: 'https://a.example', source_title: 'A' }]);
  });

  it('ignores a degraded research result (empty findings) — no sources, but surfaces the degradation', () => {
    const events = [
      { type: 'agent.mcp_tool_result', content: [{ type: 'text', text: '{"findings":[],"degraded":"research_unavailable"}' }] },
    ];
    const out = readSession(events);
    expect(out.sources).toEqual([]);
    // research_unavailable is surfaced so a total failure (e.g. unset key) is visible, not silent.
    expect(out.degraded).toBe('research_unavailable');
  });

  it('joins multiple degradation markers (a fetch fell back AND research was unavailable)', () => {
    const events = [
      { type: 'agent.mcp_tool_result', content: [{ type: 'text', text: '{"id":"x","kind":"reference","degraded":"summary_only"}' }] },
      { type: 'agent.mcp_tool_result', content: [{ type: 'text', text: '{"findings":[],"degraded":"research_unavailable"}' }] },
    ];
    expect(readSession(events).degraded).toBe('summary_only,research_unavailable');
  });
});

describe('readUsage', () => {
  // The real GET /sessions/{id} .usage shape: flat input/output/cache_read, plus cache_creation split by TTL.
  const realUsage = {
    cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 42685 },
    cache_read_input_tokens: 230613,
    input_tokens: 14,
    output_tokens: 23354,
  };

  it('normalizes the session .usage object, collapsing the two cache_creation buckets', () => {
    expect(readUsage(realUsage)).toEqual({
      input_tokens: 14,
      output_tokens: 23354,
      cache_read_input_tokens: 230613,
      cache_creation_input_tokens: 42685, // 0 (1h) + 42685 (5m)
    });
  });

  it('sums both cache_creation TTL buckets when both are non-zero', () => {
    const u = { ...realUsage, cache_creation: { ephemeral_1h_input_tokens: 100, ephemeral_5m_input_tokens: 900 } };
    expect(readUsage(u)?.cache_creation_input_tokens).toBe(1000);
  });

  it('returns null when usage is absent (unfinished/failed session, or an API shape change)', () => {
    expect(readUsage(undefined)).toBeNull();
    expect(readUsage(null)).toBeNull();
    expect(readUsage('not-an-object')).toBeNull();
  });

  it('returns null for an object with no recognisable token fields (not-measured, not a misleading zero)', () => {
    expect(readUsage({})).toBeNull();
    expect(readUsage({ something_else: 1 })).toBeNull();
  });

  it('treats missing cache_creation as zero and still reads the flat fields', () => {
    expect(readUsage({ input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 9 })).toEqual({
      input_tokens: 5,
      output_tokens: 7,
      cache_read_input_tokens: 9,
      cache_creation_input_tokens: 0,
    });
  });

  it('also accepts a flat cache_creation_input_tokens (span-style) shape', () => {
    expect(readUsage({ input_tokens: 1, cache_creation_input_tokens: 50 })).toMatchObject({
      cache_creation_input_tokens: 50,
    });
  });

  it('coerces missing or non-number fields to 0 without throwing', () => {
    expect(readUsage({ input_tokens: 'oops', output_tokens: null, cache_read_input_tokens: 3 })).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 0,
    });
  });
});

describe('renderTrace', () => {
  it('renders a recall query (truncated) and its neighbour titles', () => {
    const events = [
      { type: 'agent.mcp_tool_use', name: 'recall', input: { stimulus_text: 'capture then extract', k: 8 } },
      {
        type: 'agent.mcp_tool_result',
        content: [{ type: 'text', text: '[{"id":"1","kind":"reference","title":"A piece"},{"id":"2","kind":"self","title":null}]' }],
      },
    ];
    const out = renderTrace(events);
    expect(out).toContain('→ recall   "capture then extract" (k=8)');
    expect(out).toContain('← 2 neighbour(s): A piece; self:2');
  });

  it('renders write_pending with the body title and an ok result', () => {
    const events = [
      { type: 'agent.mcp_tool_use', name: 'write_pending', input: { body: '# Seeing like a vendor\n\nThe location...' } },
      { type: 'agent.mcp_tool_result', content: [{ type: 'text', text: '{"ok":true}' }] },
    ];
    const out = renderTrace(events);
    expect(out).toContain('→ write_pending   "# Seeing like a vendor"');
    expect(out).toContain('← ok');
  });

  it('renders interim agent messages and thinking markers', () => {
    const events = [
      { type: 'agent.thinking' },
      { type: 'agent.message', content: [{ type: 'text', text: 'This one earns a piece.' }] },
    ];
    const out = renderTrace(events);
    expect(out).toContain('· thinking…');
    expect(out).toContain('💬 This one earns a piece.');
  });

  it('marks a fetch and a tool error', () => {
    const events = [
      { type: 'agent.mcp_tool_use', name: 'fetch', input: { id: 'abc123' } },
      { type: 'agent.mcp_tool_result', is_error: true, content: [{ type: 'text', text: 'boom' }] },
    ];
    const out = renderTrace(events);
    expect(out).toContain('→ fetch    abc123');
    expect(out).toContain('← ERROR: boom');
  });

  it('returns an empty string for no events', () => {
    expect(renderTrace([])).toBe('');
  });
});
