// ABOUT: Tests for Relay session readout — what the orchestrator extracts from a finished MA session
// ABOUT: the agent's closing text (the declined reason) and any mid-session fetch degradation

import { describe, it, expect } from 'vitest';
import { readSession, renderTrace } from './session-readout';

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
    expect(readSession([{ type: 'session.status_idle' }])).toEqual({ closingText: null, degraded: null });
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
    expect(readSession(undefined as never)).toEqual({ closingText: null, degraded: null });
    expect(readSession([])).toEqual({ closingText: null, degraded: null });
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
