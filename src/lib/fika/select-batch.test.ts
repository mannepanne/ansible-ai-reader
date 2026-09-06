// @vitest-environment node
// ABOUT: Tests for Fika batch selection
// ABOUT: Idempotence, carry-forward, oldest + freshest top-up, exclusions, empty states

import { describe, it, expect } from 'vitest';
import { selectBatch, type BatchCandidate } from './select-batch';

const NOW = new Date('2026-09-06T07:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const candidates: BatchCandidate[] = [
  { id: 'old-60', createdAt: daysAgo(60) },
  { id: 'old-30', createdAt: daysAgo(30) },
  { id: 'mid-10', createdAt: daysAgo(10) },
  { id: 'fresh-3', createdAt: daysAgo(3) },
  { id: 'fresh-1', createdAt: daysAgo(1) },
];

describe('selectBatch', () => {
  it('picks the oldest for slot 1 and the newest fresh item for slot 2 on a first run', () => {
    expect(selectBatch({ previous: null, candidates, excludedIds: new Set(), now: NOW })).toEqual([
      { itemId: 'old-60', slot: 1, carriedFrom: null },
      { itemId: 'fresh-1', slot: 2, carriedFrom: null },
    ]);
  });

  it('is idempotent: two unarchived items carry forward unchanged, nothing new enters', () => {
    const previous = {
      id: 'batch-yesterday',
      items: [
        { itemId: 'old-60', slot: 1 as const, archived: false, deleted: false },
        { itemId: 'fresh-1', slot: 2 as const, archived: false, deleted: false },
      ],
    };
    expect(selectBatch({ previous, candidates, excludedIds: new Set(), now: NOW })).toEqual([
      { itemId: 'old-60', slot: 1, carriedFrom: 'batch-yesterday' },
      { itemId: 'fresh-1', slot: 2, carriedFrom: 'batch-yesterday' },
    ]);
  });

  it('carries forward even when the most recent batch is older than yesterday', () => {
    const previous = {
      id: 'batch-last-week',
      items: [{ itemId: 'old-30', slot: 1 as const, archived: false, deleted: false }],
    };
    const result = selectBatch({ previous, candidates, excludedIds: new Set(), now: NOW });
    expect(result[0]).toEqual({ itemId: 'old-30', slot: 1, carriedFrom: 'batch-last-week' });
    expect(result[1].slot).toBe(2);
  });

  it('replaces exactly the archived item and keeps the other in its slot', () => {
    const previous = {
      id: 'b1',
      items: [
        { itemId: 'old-60', slot: 1 as const, archived: true, deleted: false },
        { itemId: 'fresh-1', slot: 2 as const, archived: false, deleted: false },
      ],
    };
    const pool = candidates.filter((c) => c.id !== 'old-60');
    expect(selectBatch({ previous, candidates: pool, excludedIds: new Set(), now: NOW })).toEqual([
      { itemId: 'old-30', slot: 1, carriedFrom: null },
      { itemId: 'fresh-1', slot: 2, carriedFrom: 'b1' },
    ]);
  });

  it('refills slot 2 with the freshest item when the fresh one was archived', () => {
    const previous = {
      id: 'b1',
      items: [
        { itemId: 'old-60', slot: 1 as const, archived: false, deleted: false },
        { itemId: 'fresh-1', slot: 2 as const, archived: true, deleted: false },
      ],
    };
    const pool = candidates.filter((c) => c.id !== 'fresh-1');
    expect(selectBatch({ previous, candidates: pool, excludedIds: new Set(), now: NOW })).toEqual([
      { itemId: 'old-60', slot: 1, carriedFrom: 'b1' },
      { itemId: 'fresh-3', slot: 2, carriedFrom: null },
    ]);
  });

  it('drops a deleted item from the rotation and tops up its slot', () => {
    const previous = {
      id: 'b1',
      items: [
        { itemId: 'gone', slot: 1 as const, archived: false, deleted: true },
        { itemId: 'fresh-1', slot: 2 as const, archived: false, deleted: false },
      ],
    };
    const result = selectBatch({ previous, candidates, excludedIds: new Set(), now: NOW });
    expect(result.map((r) => r.itemId)).toEqual(['old-60', 'fresh-1']);
  });

  it('falls back to the next-oldest for slot 2 when nothing is fresh', () => {
    const stale = candidates.filter((c) => c.id.startsWith('old') || c.id === 'mid-10');
    expect(selectBatch({ previous: null, candidates: stale, excludedIds: new Set(), now: NOW })).toEqual([
      { itemId: 'old-60', slot: 1, carriedFrom: null },
      { itemId: 'old-30', slot: 2, carriedFrom: null },
    ]);
  });

  it('honours the exclusion set', () => {
    const result = selectBatch({
      previous: null,
      candidates,
      excludedIds: new Set(['old-60', 'fresh-1']),
      now: NOW,
    });
    expect(result.map((r) => r.itemId)).toEqual(['old-30', 'fresh-3']);
  });

  it('returns one item when only one is eligible, and none when none are', () => {
    expect(selectBatch({ previous: null, candidates: [candidates[2]], excludedIds: new Set(), now: NOW })).toEqual([
      { itemId: 'mid-10', slot: 1, carriedFrom: null },
    ]);
    expect(selectBatch({ previous: null, candidates: [], excludedIds: new Set(), now: NOW })).toEqual([]);
  });

  it('breaks createdAt ties deterministically by id', () => {
    const tied = [
      { id: 'b', createdAt: daysAgo(40) },
      { id: 'a', createdAt: daysAgo(40) },
    ];
    expect(selectBatch({ previous: null, candidates: tied, excludedIds: new Set(), now: NOW })[0].itemId).toBe('a');
  });
});
