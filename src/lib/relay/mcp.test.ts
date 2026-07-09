// ABOUT: Tests for the hand-rolled MCP JSON-RPC layer the bridge exposes at POST /mcp
// ABOUT: Covers the initialize handshake, tools/list, tools/call dispatch, notifications, and errors

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRecall = vi.fn();
const mockFetchById = vi.fn();
const mockWritePending = vi.fn();
const mockIngestReference = vi.fn();
const mockResearch = vi.fn();
vi.mock('./tools', () => ({
  recall: (...a: unknown[]) => mockRecall(...a),
  fetchById: (...a: unknown[]) => mockFetchById(...a),
  writePending: (...a: unknown[]) => mockWritePending(...a),
  ingestReference: (...a: unknown[]) => mockIngestReference(...a),
  research: (...a: unknown[]) => mockResearch(...a),
}));

import {
  handleMcpMessage,
  TOOLS,
  SUPPORTED_PROTOCOL_VERSIONS,
  DEFAULT_PROTOCOL_VERSION,
  SERVER_INFO,
} from './mcp';

const deps = { supabase: {}, ai: { run: vi.fn() }, readerToken: 't' } as never;

beforeEach(() => vi.clearAllMocks());

describe('initialize', () => {
  it('echoes a supported protocol version and advertises the tools capability', async () => {
    const res = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0] } },
      deps,
    );
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
  });

  it('falls back to the default protocol version when the client requests an unsupported one', async () => {
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      deps,
    )) as { result: { protocolVersion: string } };
    expect(res.result.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
  });
});

describe('notifications', () => {
  it('returns null (no response body) for notifications/initialized', async () => {
    const res = await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps);
    expect(res).toBeNull();
  });

  it('ignores an unknown notification (no id) rather than erroring', async () => {
    const res = await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/somethingElse' }, deps);
    expect(res).toBeNull();
  });
});

describe('tools/list', () => {
  it('lists exactly the five tools with names, descriptions and input schemas', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, deps)) as {
      result: { tools: Array<{ name: string; description: string; inputSchema: object }> };
    };
    const names = res.result.tools.map((t) => t.name).sort();
    expect(names).toEqual(['fetch', 'ingest_reference', 'recall', 'research', 'write_pending']);
    for (const t of res.result.tools) {
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('instructs write_pending to attach type:"source" links (else verification_status never fires)', () => {
    const wp = TOOLS.find((t) => t.name === 'write_pending')!;
    // The agent only stamps a piece 'sourced' if it attaches a source link — so the contract must ask for it.
    expect(wp.description).toMatch(/source/i);
    const links = (wp.inputSchema.properties as Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }>).links;
    expect(links.items?.properties?.type?.enum).toEqual(['source', 'recall']);
  });

  it('keeps log_decision / publish / promote off the surface (agent stays blind to the gate)', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).not.toContain('log_decision');
    expect(names).not.toContain('publish');
    expect(names).not.toContain('promote');
  });
});

describe('tools/call', () => {
  it('dispatches recall and wraps the result as MCP text content', async () => {
    mockRecall.mockResolvedValue([{ id: 'r1', kind: 'reference', title: 'A', summary: 's', concepts: [] }]);
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'recall', arguments: { stimulus_text: 'x', k: 3 } } },
      deps,
    )) as { result: { content: Array<{ type: string; text: string }>; isError?: boolean } };

    expect(mockRecall).toHaveBeenCalledWith(deps, { stimulus_text: 'x', k: 3 });
    expect(res.result.isError).toBeUndefined();
    expect(res.result.content[0].type).toBe('text');
    expect(JSON.parse(res.result.content[0].text)).toEqual([
      { id: 'r1', kind: 'reference', title: 'A', summary: 's', concepts: [] },
    ]);
  });

  it('routes each tool name to its implementation', async () => {
    mockFetchById.mockResolvedValue({ id: 'p', kind: 'self', title: null, text: 'b' });
    mockWritePending.mockResolvedValue({ ok: true });
    mockIngestReference.mockResolvedValue({ ok: true });

    await handleMcpMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'fetch', arguments: { id: 'p' } } }, deps);
    await handleMcpMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'write_pending', arguments: { body: 'b' } } }, deps);
    await handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'ingest_reference', arguments: { text: 't' } } }, deps);

    expect(mockFetchById).toHaveBeenCalledWith(deps, { id: 'p' });
    expect(mockWritePending).toHaveBeenCalledWith(deps, { body: 'b' });
    expect(mockIngestReference).toHaveBeenCalledWith(deps, { text: 't' });
  });

  it('dispatches the research tool to its implementation', async () => {
    mockResearch.mockResolvedValue({ findings: [{ quote: 'q', source_url: 'https://a', source_title: 't' }] });
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'research', arguments: { query: 'a fact', k: 3 } } },
      deps,
    )) as { result: { content: Array<{ text: string }>; isError?: boolean } };

    expect(mockResearch).toHaveBeenCalledWith(deps, { query: 'a fact', k: 3 });
    expect(res.result.isError).toBeUndefined();
    expect(JSON.parse(res.result.content[0].text).findings).toHaveLength(1);
  });

  it('returns an isError result (not a protocol error) when a tool throws', async () => {
    mockRecall.mockRejectedValue(new Error('recall blew up'));
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'recall', arguments: { stimulus_text: 'x' } } },
      deps,
    )) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/recall blew up/);
  });

  it('errors on an unknown tool name', async () => {
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'nope', arguments: {} } },
      deps,
    )) as { error: { code: number; message: string } };
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toMatch(/nope/);
  });

  it('defaults missing arguments to an empty object', async () => {
    mockWritePending.mockRejectedValue(new Error('write_pending: body is required'));
    await handleMcpMessage({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'write_pending' } }, deps);
    expect(mockWritePending).toHaveBeenCalledWith(deps, {});
  });
});

describe('protocol errors', () => {
  it('returns -32601 for an unknown method that has an id', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 11, method: 'resources/list' }, deps)) as {
      error: { code: number };
    };
    expect(res.error.code).toBe(-32601);
  });

  it('returns -32600 for a non-object message', async () => {
    const res = (await handleMcpMessage('garbage' as never, deps)) as { error: { code: number } };
    expect(res.error.code).toBe(-32600);
  });
});
