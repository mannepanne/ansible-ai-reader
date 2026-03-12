// ABOUT: Tests for p-queue compatibility with Cloudflare Workers edge runtime
// ABOUT: Validates basic queueing, concurrency limits, and rate limiting

import { describe, it, expect, vi } from 'vitest';
import PQueue from 'p-queue';

describe('p-queue edge runtime compatibility', () => {
  it('creates queue instance without errors', () => {
    expect(() => new PQueue()).not.toThrow();
  });

  it('executes tasks in order with concurrency limit', async () => {
    const queue = new PQueue({ concurrency: 1 });
    const results: number[] = [];

    const task1 = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(1);
    };

    const task2 = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(2);
    };

    const task3 = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(3);
    };

    await Promise.all([
      queue.add(task1),
      queue.add(task2),
      queue.add(task3),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  it('respects concurrency limit', async () => {
    const queue = new PQueue({ concurrency: 2 });
    let activeCount = 0;
    let maxActiveCount = 0;

    const createTask = () => async () => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeCount--;
    };

    await Promise.all([
      queue.add(createTask()),
      queue.add(createTask()),
      queue.add(createTask()),
      queue.add(createTask()),
    ]);

    expect(maxActiveCount).toBe(2);
  });

  it('handles interval-based rate limiting', async () => {
    const queue = new PQueue({
      concurrency: 1,
      interval: 100,
      intervalCap: 1,
    });

    const startTime = Date.now();
    const timestamps: number[] = [];

    const createTask = () => async () => {
      timestamps.push(Date.now() - startTime);
    };

    await Promise.all([
      queue.add(createTask()),
      queue.add(createTask()),
      queue.add(createTask()),
    ]);

    // With 100ms interval and 1 task per interval:
    // Task 1: ~0ms
    // Task 2: ~100ms
    // Task 3: ~200ms
    expect(timestamps[0]).toBeLessThan(50);
    expect(timestamps[1]).toBeGreaterThan(80);
    expect(timestamps[1]).toBeLessThan(150);
    expect(timestamps[2]).toBeGreaterThan(180);
  });

  it('handles task failures without breaking queue', async () => {
    const queue = new PQueue({ concurrency: 1 });
    const results: string[] = [];

    const task1 = async () => {
      results.push('task1');
    };

    const task2 = async () => {
      throw new Error('Task 2 failed');
    };

    const task3 = async () => {
      results.push('task3');
    };

    await queue.add(task1);
    await expect(queue.add(task2)).rejects.toThrow('Task 2 failed');
    await queue.add(task3);

    expect(results).toEqual(['task1', 'task3']);
  });

  it('provides queue size and pending count', async () => {
    const queue = new PQueue({ concurrency: 1 });

    const longTask = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    };

    const promise1 = queue.add(longTask);
    queue.add(longTask);
    queue.add(longTask);

    expect(queue.size).toBeGreaterThan(0);
    expect(queue.pending).toBe(1);

    await promise1;
    await queue.onIdle();

    expect(queue.size).toBe(0);
    expect(queue.pending).toBe(0);
  });
});
