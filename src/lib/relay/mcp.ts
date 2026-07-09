// ABOUT: Hand-rolled minimal MCP server (JSON-RPC over Streamable HTTP) for the Relay bridge
// ABOUT: Implements initialize / notifications/initialized / tools/list / tools/call — tools only,
// ABOUT: no Durable Objects, no SDK; the leanest surface a Managed Agent's MCP connector needs.

import { recall, fetchById, writePending, ingestReference, research, type ToolDeps } from './tools';

// Identity returned in the initialize handshake.
export const SERVER_INFO = { name: 'relay-bridge', version: '1.0.0' };

// MCP protocol revisions this server understands. We echo the client's requested version when it
// is one of these (the spec-correct behaviour); otherwise we answer with our default. Getting this
// wrong is the most likely silent failure in a hand-rolled initialize, so it is kept explicit.
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (deps: ToolDeps, args: Record<string, unknown>) => Promise<unknown>;
}

// The entire tool surface the narrator sees. No publish/promote/log_decision: promotion is
// backend-side on approval and decision capture is backend-observed, so the agent stays blind
// to the human gate (spec §5).
export const TOOLS: ToolDef[] = [
  {
    name: 'recall',
    description:
      'Recall the conceptually nearest material to a stimulus — prior reporting and your own past pieces. Returns neighbours as {id, kind, title, summary, concepts}; fetch an id for its full text.',
    inputSchema: {
      type: 'object',
      properties: {
        stimulus_text: { type: 'string', description: 'The text to find conceptual neighbours for.' },
        k: { type: 'integer', description: 'How many neighbours to return (1–50, default 8).', minimum: 1, maximum: 50 },
      },
      required: ['stimulus_text'],
    },
    handler: (deps, args) => recall(deps, args as { stimulus_text: string; k?: number }),
  },
  {
    name: 'fetch',
    description:
      'Fetch the full text of one recall hit by its id — the full article body for a reference, or the full body of one of your own pieces.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'An id from a recall result.' } },
      required: ['id'],
    },
    handler: (deps, args) => fetchById(deps, args as { id: string }),
  },
  {
    name: 'write_pending',
    description:
      'Write a new piece. Provide the full body, a short summary, the concepts it touches, and its links — the provenance behind it. The prose itself names no source; the links carry that record privately. Add one link per thing you drew on: {type:"source", ref:<url>, title?} for each research finding you grounded a specific claim on, and {type:"recall", ref:<id>} for each memory you leaned on. This is how the work is later checked, so record the sources you grounded on.',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'The full piece.' },
        summary: { type: 'string', description: 'A one-line summary for later recall.' },
        concepts: { type: 'array', items: { type: 'string' }, description: 'Concepts the piece touches.' },
        links: {
          type: 'array',
          description: 'Provenance links: {type:"source", ref:<url>, title?} for grounded facts, {type:"recall", ref:<id>} for memory drawn on.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['source', 'recall'], description: '"source" = a research URL; "recall" = a memory id.' },
              ref: { type: 'string', description: 'A source URL (for type:"source") or a recall id (for type:"recall").' },
              title: { type: 'string', description: 'Optional human-readable label.' },
            },
            required: ['type', 'ref'],
          },
        },
      },
      required: ['body'],
    },
    handler: (deps, args) =>
      writePending(deps, args as { body: string; summary?: string; concepts?: string[]; links?: unknown[] }),
  },
  {
    name: 'ingest_reference',
    description:
      'Record a piece of reference material you gathered, so it becomes recallable later. Requires the source URL it came from (used to avoid storing the same source twice).',
    inputSchema: {
      type: 'object',
      properties: {
        source_ref: { type: 'string', description: 'The source URL it came from (required).' },
        title: { type: 'string', description: 'A title for the reference.' },
        text: { type: 'string', description: 'The reference text to remember.' },
      },
      required: ['text', 'source_ref'],
    },
    handler: (deps, args) => ingestReference(deps, args as { source_ref?: string; title?: string; text: string }),
  },
  {
    name: 'research',
    description:
      'Search the web for verifiable facts before you assert a specific. Returns findings as {quote, source_url, source_title} — verbatim extracts you can attribute to a source, not a paraphrase. If it returns nothing (degraded), do not assert the specific: hedge or stay silent.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What fact to check or find.' },
        k: { type: 'integer', description: 'How many findings to return (1–10, default 5).', minimum: 1, maximum: 10 },
      },
      required: ['query'],
    },
    handler: (deps, args) => research(deps, args as { query: string; k?: number }),
  },
];

type JsonId = string | number | null;
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonId;
  result?: unknown;
  error?: { code: number; message: string };
}

function ok(id: JsonId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}
function err(id: JsonId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * Handle one MCP JSON-RPC message. Returns the response object, or `null` for notifications
 * (which take no response — the caller answers HTTP 202). Tool-execution failures come back as
 * a normal result with `isError: true` (so the model sees the message), while protocol problems
 * (bad request, unknown method/tool) are JSON-RPC errors.
 */
export async function handleMcpMessage(
  message: unknown,
  deps: ToolDeps,
): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return err(null, -32600, 'Invalid Request');
  }

  const msg = message as { id?: JsonId; method?: string; params?: Record<string, unknown> };
  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id');
  const id = (msg.id ?? null) as JsonId;
  const { method, params } = msg;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion as string | undefined;
      const protocolVersion =
        requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
      return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    }

    case 'tools/list':
      return ok(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case 'tools/call': {
      const name = params?.name as string | undefined;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return err(id, -32602, `Unknown tool: ${name}`);
      }
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      try {
        const result = await tool.handler(deps, args);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (e) {
        return ok(id, {
          content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }

    default:
      // Notifications (no id) we don't handle are simply ignored, per JSON-RPC. Anything with an
      // id we don't recognise is a genuine method-not-found.
      if (!hasId) {
        return null;
      }
      return err(id, -32601, `Method not found: ${method}`);
  }
}
