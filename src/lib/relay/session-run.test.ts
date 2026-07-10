// ABOUT: Tests for the Relay session-run core — stimulus formatting and the create→send→poll loop

import { describe, it, expect, vi } from 'vitest';
import { formatStimulus, runSession } from './session-run';

// A fully-engaged item: every enrichment field present. Used across the enrichment + blindness tests.
const engagedRow = {
  title: 'Seeing like a vendor',
  short_summary: 'The submarine surfaces in the metadata.',
  commentariat_summary: 'But procurement is boring.',
  tags: ['sovereignty', 'surveillance', 'defence'],
  document_note: 'The exit was sold off with the entrance.',
};

describe('formatStimulus', () => {
  it('assembles title + summary + counter-case', () => {
    const out = formatStimulus({
      title: 'Seeing like a vendor',
      short_summary: 'The submarine surfaces in the metadata.',
      commentariat_summary: 'But procurement is boring.',
      tags: null,
      document_note: null,
    });
    expect(out).toContain('Title: Seeing like a vendor');
    expect(out).toContain('Summary:\nThe submarine surfaces in the metadata.');
    expect(out).toContain('Counter-case:\nBut procurement is boring.');
  });

  it('works with just a summary (no counter-case)', () => {
    const out = formatStimulus({ title: 'T', short_summary: 'A point.', commentariat_summary: null, tags: null, document_note: null });
    expect(out).toContain('Title: T');
    expect(out).toContain('Summary:\nA point.');
    expect(out).not.toContain('Counter-case');
  });

  it('enriches the stimulus with tags and the note (2.3a)', () => {
    const out = formatStimulus(engagedRow);
    expect(out).toContain('Tags: sovereignty, surveillance, defence');
    expect(out).toContain('Note:\nThe exit was sold off with the entrance.');
    // ordering: tags sit above the note, both between summary and counter-case
    expect(out.indexOf('Summary:')).toBeLessThan(out.indexOf('Tags:'));
    expect(out.indexOf('Tags:')).toBeLessThan(out.indexOf('Note:'));
    expect(out.indexOf('Note:')).toBeLessThan(out.indexOf('Counter-case:'));
  });

  it('omits tags/note when absent or empty', () => {
    const out = formatStimulus({ ...engagedRow, tags: [], document_note: '   ' });
    expect(out).not.toContain('Tags:');
    expect(out).not.toContain('Note:');
    // blank tag entries are dropped, not rendered as an empty list
    const partial = formatStimulus({ ...engagedRow, tags: ['ai', '  ', ''] });
    expect(partial).toContain('Tags: ai');
    expect(partial).not.toContain('Tags: ai, ,');
  });

  it('never leaks a rating into the stimulus (§D gate-blindness / bias)', () => {
    // formatStimulus takes no rating input by construction; assert the assembled text of a
    // fully-engaged item carries no rating verdict the agent could read as a commission.
    const out = formatStimulus(engagedRow);
    expect(out).not.toMatch(/interesting|rated|💡|🤷/i);
  });

  it("lean mode drops tags and the note but keeps title, summary, counter-case (pre-2.3a shape)", () => {
    const out = formatStimulus(engagedRow, 'lean');
    expect(out).toContain('Title: Seeing like a vendor');
    expect(out).toContain('Summary:\nThe submarine surfaces in the metadata.');
    expect(out).toContain('Counter-case:\nBut procurement is boring.');
    expect(out).not.toContain('Tags:');
    expect(out).not.toContain('Note:');
  });

  it('defaults to full mode when no mode is passed', () => {
    expect(formatStimulus(engagedRow)).toContain('Tags:');
    expect(formatStimulus(engagedRow, 'full')).toContain('Note:');
  });

  it('enforces the summary-guard in lean mode too', () => {
    expect(() =>
      formatStimulus({ title: 'T', short_summary: null, commentariat_summary: 'c', tags: ['a'], document_note: 'n' }, 'lean'),
    ).toThrow(/summary/);
  });

  it('throws when there is no summary text, even with tags/note present (summary-guard)', () => {
    expect(() => formatStimulus({ title: 'T', short_summary: null, commentariat_summary: null, tags: null, document_note: null })).toThrow(/summary/);
    expect(() => formatStimulus({ title: 'T', short_summary: '   ', commentariat_summary: null, tags: null, document_note: null })).toThrow(/summary/);
    // enrichment parts must not let a summary-less item satisfy the guard and spend a session
    expect(() => formatStimulus({ title: 'T', short_summary: null, commentariat_summary: 'c', tags: ['a'], document_note: 'n' })).toThrow(/summary/);
  });
});

// A scripted MA client: returns queued responses per (method path), records calls.
function makeMa(statuses: string[]) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let poll = 0;
  const ma = vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/sessions') return { id: 'sess-1' };
    if (path.endsWith('/events?beta=true') && method === 'POST') return null;
    if (method === 'GET' && path === '/sessions/sess-1') return { status: statuses[Math.min(poll++, statuses.length - 1)] };
    if (method === 'GET' && path === '/sessions/sess-1/events?beta=true') return { data: [{ type: 'agent.message', content: [{ type: 'text', text: 'done' }] }] };
    return {};
  });
  return { ma, calls };
}

const ids = { agentId: 'agent-1', environmentId: 'env-1', vaultId: 'vault-1' };
const noSleep = () => Promise.resolve();

describe('runSession', () => {
  it('creates a session, sends the stimulus, polls until idle, returns events', async () => {
    const { ma, calls } = makeMa(['running', 'running', 'idle']);
    const result = await runSession(ma, ids, 'THE STIMULUS', { readerId: 'r1', sleep: noSleep, maxPolls: 10 });

    expect(result.sessionId).toBe('sess-1');
    expect(result.status).toBe('idle');
    expect(result.events).toHaveLength(1);

    // session created against the existing resources
    const create = calls.find((c) => c.path === '/sessions');
    expect(create?.body).toMatchObject({ agent: 'agent-1', environment_id: 'env-1', vault_ids: ['vault-1'] });
    // the stimulus was sent as a user.message
    const sent = calls.find((c) => c.path.endsWith('/events?beta=true') && c.method === 'POST');
    expect(JSON.stringify(sent?.body)).toContain('THE STIMULUS');
  });

  it('stops polling when the session terminates', async () => {
    const { ma } = makeMa(['running', 'terminated']);
    const result = await runSession(ma, ids, 'x', { readerId: 'r1', sleep: noSleep, maxPolls: 10 });
    expect(result.status).toBe('terminated');
  });

  it('gives up after maxPolls without idle (returns the last status)', async () => {
    const { ma, calls } = makeMa(['running']);
    const result = await runSession(ma, ids, 'x', { readerId: 'r1', sleep: noSleep, maxPolls: 4 });
    expect(result.status).toBe('running');
    const statusPolls = calls.filter((c) => c.method === 'GET' && c.path === '/sessions/sess-1');
    expect(statusPolls).toHaveLength(4);
  });

  it('exits on the wall-clock budget before maxPolls, and logs the phases', async () => {
    const { ma, calls } = makeMa(['running']); // never reaches idle
    let t = 0;
    const now = () => (t += 1000); // each call advances 1s
    const logs: string[] = [];
    const result = await runSession(ma, ids, 'x', {
      readerId: 'r1',
      sleep: noSleep,
      now,
      budgetMs: 500, // budget trips on the first post-start now() check
      maxPolls: 100,
      log: (m) => logs.push(m),
    });

    expect(result.status).toBe('running');
    // stopped on the budget, not by exhausting the 100-poll cap
    const statusPolls = calls.filter((c) => c.method === 'GET' && c.path === '/sessions/sess-1');
    expect(statusPolls.length).toBeLessThan(100);
    expect(logs.some((l) => /created/.test(l))).toBe(true);
    expect(logs.some((l) => /budget/.test(l))).toBe(true);
    expect(logs.some((l) => /poll exit/.test(l))).toBe(true);
  });
});
