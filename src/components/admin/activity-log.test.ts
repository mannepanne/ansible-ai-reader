// ABOUT: Tests for mergeActivity — the pure chronological merge of decisions + gate skips (2.3c).

import { describe, it, expect } from 'vitest';
import { mergeActivity } from './activity-log';
import type { RelayActivityRow } from './types';

const decision = (id: string, createdAt: string): RelayActivityRow => ({
  kind: 'decision',
  id,
  verdict: 'wrote',
  pieceId: null,
  reason: null,
  degraded: null,
  stimulusRef: [],
  stimulusTitles: [],
  pieceSummary: null,
  sources: [],
  createdAt,
});

const skip = (id: string, createdAt: string): RelayActivityRow => ({
  kind: 'gate_skip',
  id,
  createdAt,
  code: 'no_signal',
  signals: [],
  stimulusRef: `r-${id}`,
  stimulusTitle: null,
});

describe('mergeActivity', () => {
  it('returns [] for two empty sources', () => {
    expect(mergeActivity([], [])).toEqual([]);
  });

  it('interleaves both kinds newest-first by createdAt', () => {
    const decisions = [decision('d1', '2026-07-10T12:00:00Z'), decision('d2', '2026-07-10T09:00:00Z')];
    const skips = [skip('s1', '2026-07-10T11:00:00Z'), skip('s2', '2026-07-10T08:00:00Z')];
    expect(mergeActivity(decisions, skips).map((r) => r.id)).toEqual(['d1', 's1', 'd2', 's2']);
  });

  it('resolves an equal timestamp across the two sources deterministically (kind, then id)', () => {
    const ts = '2026-07-10T12:00:00Z';
    // Same instant, one of each kind. 'decision' < 'gate_skip' lexically, so the decision sorts first.
    // The result must not depend on which source is passed first — else pagination could jitter the pair.
    expect(mergeActivity([decision('d', ts)], [skip('s', ts)]).map((r) => `${r.kind}:${r.id}`)).toEqual([
      'decision:d',
      'gate_skip:s',
    ]);
  });

  it('breaks a same-kind, same-timestamp tie by id', () => {
    const ts = '2026-07-10T12:00:00Z';
    expect(mergeActivity([decision('d-b', ts), decision('d-a', ts)], []).map((r) => r.id)).toEqual(['d-a', 'd-b']);
  });
});
