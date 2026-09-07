// @vitest-environment node
// ABOUT: Tests for the RelayOrchestrator Durable Object host
// ABOUT: Verifies routing, the DO-storage-backed RunStore, the bridge-backed finalize, and the MA client

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockEnqueue = vi.fn();
const mockOnAlarm = vi.fn();
vi.mock('../src/lib/relay/orchestrator', () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
  onAlarm: (...args: unknown[]) => mockOnAlarm(...args),
}));

const mockCreateClient = vi.fn((..._args: unknown[]) => ({ __isClient: true }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import worker, { RelayOrchestrator } from './relay-orchestrator';
import type { OrchestratorDeps } from '../src/lib/relay/orchestrator';

// In-memory stand-in for DO storage + the blockConcurrencyWhile critical section
function makeState() {
  const data = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => data.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    delete: vi.fn(async (key: string) => data.delete(key)),
    setAlarm: vi.fn(async () => undefined),
  };
  const state = {
    storage,
    blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => fn()),
  };
  return { state, storage, data };
}

function makeEnv(overrides: Record<string, string> = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_KEY: 'secret',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    RELAY_CONTROL_TOKEN: 'control-token',
    RELAY_AGENT_ID: 'agent-1',
    RELAY_ENV_ID: 'env-1',
    RELAY_VAULT_ID: 'vault-1',
    ...overrides,
  };
}

function req(path: string, init?: RequestInit) {
  return new Request(`https://relay-orchestrator.example.com${path}`, init);
}

function ok(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function fail(status: number, text: string) {
  return { ok: false, status, json: async () => ({}), text: async () => text } as Response;
}

// Runs a fetch('/enqueue') and hands back the deps the DO built for the core
async function captureDeps(env = makeEnv(), stateOverride?: ReturnType<typeof makeState>) {
  const { state } = stateOverride ?? makeState();
  let captured: OrchestratorDeps | undefined;
  mockEnqueue.mockImplementation(async (deps: OrchestratorDeps) => {
    captured = deps;
  });
  const orchestrator = new RelayOrchestrator(state as any, env as any);
  const res = await orchestrator.fetch(
    req('/enqueue', { method: 'POST', body: JSON.stringify({ readerId: 'r1' }) })
  );
  expect(res.status).toBe(202);
  return captured!;
}

describe('RelayOrchestrator DO', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetch routing', () => {
    it('enqueues a readerId inside blockConcurrencyWhile and responds 202', async () => {
      const { state } = makeState();
      const orchestrator = new RelayOrchestrator(state as any, makeEnv() as any);

      const res = await orchestrator.fetch(
        req('/enqueue', { method: 'POST', body: JSON.stringify({ readerId: 'reader-42' }) })
      );

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ queued: true, readerId: 'reader-42' });
      expect(state.blockConcurrencyWhile).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ ids: { agentId: 'agent-1', environmentId: 'env-1', vaultId: 'vault-1' } }), 'reader-42');
    });

    it('rejects an enqueue without readerId with 400', async () => {
      const { state } = makeState();
      const orchestrator = new RelayOrchestrator(state as any, makeEnv() as any);

      const res = await orchestrator.fetch(req('/enqueue', { method: 'POST', body: JSON.stringify({}) }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'readerId required' });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown routes and for GET /enqueue', async () => {
      const { state } = makeState();
      const orchestrator = new RelayOrchestrator(state as any, makeEnv() as any);

      expect((await orchestrator.fetch(req('/nope', { method: 'POST' }))).status).toBe(404);
      expect((await orchestrator.fetch(req('/enqueue', { method: 'GET' }))).status).toBe(404);
      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe('alarm', () => {
    it('runs onAlarm inside blockConcurrencyWhile with freshly built deps', async () => {
      const { state } = makeState();
      const orchestrator = new RelayOrchestrator(state as any, makeEnv() as any);

      await orchestrator.alarm();

      expect(state.blockConcurrencyWhile).toHaveBeenCalledTimes(1);
      expect(mockOnAlarm).toHaveBeenCalledTimes(1);
      const deps = mockOnAlarm.mock.calls[0][0] as OrchestratorDeps;
      expect(deps.supabase).toEqual({ __isClient: true });
      expect(mockCreateClient).toHaveBeenCalledWith('https://test.supabase.co', 'secret', {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    });
  });

  describe('deps: RunStore over DO storage', () => {
    it('defaults queue and current to empty when storage is blank', async () => {
      const deps = await captureDeps();
      expect(await deps.store.getQueue()).toEqual([]);
      expect(await deps.store.getCurrent()).toBeNull();
    });

    it('round-trips queue, current and alarm through storage', async () => {
      const fake = makeState();
      const deps = await captureDeps(makeEnv(), fake);
      const current = { runId: 'run-1', readerId: 'r1', sessionId: 's1', startedAt: '2026-09-07T10:00:00Z', attempt: 0 };

      await deps.store.setQueue(['a', 'b']);
      await deps.store.setCurrent(current);
      await deps.store.setAlarm(1234);

      expect(fake.storage.put).toHaveBeenCalledWith('queue', ['a', 'b']);
      expect(fake.storage.put).toHaveBeenCalledWith('current', current);
      expect(fake.storage.setAlarm).toHaveBeenCalledWith(1234);
      expect(await deps.store.getQueue()).toEqual(['a', 'b']);
      expect(await deps.store.getCurrent()).toEqual(current);
    });

    it('exposes now/log and the optional poll interval from env', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const before = Date.now();
      const deps = await captureDeps(makeEnv({ RELAY_POLL_INTERVAL_MS: '5000' }));

      expect(deps.now()).toBeGreaterThanOrEqual(before);
      expect(deps.pollIntervalMs).toBe(5000);
      deps.log('hello');
      expect(logSpy).toHaveBeenCalledWith('[relay-do] hello');
      logSpy.mockRestore();

      const defaults = await captureDeps(makeEnv());
      expect(defaults.pollIntervalMs).toBeUndefined();
    });
  });

  describe('deps: finalize via the bridge', () => {
    const args = {
      stimulusRef: ['stim-1'],
      startedAt: '2026-09-07T10:00:00Z',
      reason: 'worth it',
      degraded: null,
      sources: [] as never[],
    };

    it('POSTs to the default bridge /decision with the control token and returns the verdict', async () => {
      vi.mocked(fetch).mockResolvedValue(ok({ verdict: 'publish', piece_id: 'p-1' }));
      const deps = await captureDeps();

      const result = await deps.finalize(args);

      expect(result).toEqual({ verdict: 'publish', piece_id: 'p-1' });
      expect(fetch).toHaveBeenCalledWith('https://ansible-relay-bridge.herrings.workers.dev/decision', {
        method: 'POST',
        headers: { authorization: 'Bearer control-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          stimulus_ref: ['stim-1'],
          started_at: '2026-09-07T10:00:00Z',
          reason: 'worth it',
          degraded: null,
          sources: [],
        }),
      });
    });

    it('honours RELAY_BRIDGE_URL and throws on a non-ok bridge response', async () => {
      vi.mocked(fetch).mockResolvedValue(fail(503, 'bridge down'));
      const deps = await captureDeps(makeEnv({ RELAY_BRIDGE_URL: 'https://bridge.local' }));

      await expect(deps.finalize(args)).rejects.toThrow('decision → 503: bridge down');
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://bridge.local/decision');
    });
  });

  describe('deps: Managed Agents client', () => {
    it('sends the API key + beta headers and parses JSON responses', async () => {
      vi.mocked(fetch).mockResolvedValue(ok({ id: 'sess-1' }));
      const deps = await captureDeps();

      const result = await deps.ma('POST', '/sessions', { agent: 'agent-1' });

      expect(result).toEqual({ id: 'sess-1' });
      expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/sessions', {
        method: 'POST',
        headers: {
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'managed-agents-2026-04-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ agent: 'agent-1' }),
      });
    });

    it('omits the body for body-less calls and returns null on 202', async () => {
      vi.mocked(fetch).mockResolvedValue(ok({ ignored: true }, 202));
      const deps = await captureDeps();

      const result = await deps.ma('GET', '/sessions/sess-1');

      expect(result).toBeNull();
      expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ method: 'GET', body: undefined });
    });

    it('throws with status and body text on a non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue(fail(401, 'bad key'));
      const deps = await captureDeps();

      await expect(deps.ma('GET', '/sessions/sess-1')).rejects.toThrow('MA GET /sessions/sess-1 → 401: bad key');
    });
  });
});

describe('relay-orchestrator host worker', () => {
  it('answers the liveness stub', async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('relay-orchestrator: DO host');
  });
});
