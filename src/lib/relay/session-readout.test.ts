// ABOUT: Tests for Relay session readout — what the orchestrator extracts from a finished MA session
// ABOUT: the agent's closing text (the declined reason) and any mid-session fetch degradation

import { describe, it, expect } from 'vitest';
import { readSession } from './session-readout';

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
