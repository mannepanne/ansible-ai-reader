// ABOUT: Tests for parseSessionArgs — the relay:session CLI argument parser.
// ABOUT: Covers reader_id requirement, --lean / --exemplar / --push-only, and validation errors.

import { describe, it, expect } from 'vitest';
import { parseSessionArgs } from './session-args';

describe('parseSessionArgs', () => {
  it('parses a bare reader_id: full mode, not push-only, no exemplar', () => {
    const r = parseSessionArgs(['abc123']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).toMatchObject({ readerId: 'abc123', mode: 'full', pushOnly: false });
    expect(r.args.exemplarOverride).toBeUndefined();
  });

  it('--lean selects lean mode', () => {
    const r = parseSessionArgs(['abc123', '--lean']);
    expect(r.ok && r.args.mode).toBe('lean');
  });

  it('--exemplar <n> sets the override without swallowing the reader_id', () => {
    const r = parseSessionArgs(['abc123', '--exemplar', '1']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args.exemplarOverride).toBe(1);
    expect(r.args.readerId).toBe('abc123'); // the "1" is the exemplar value, not the reader_id
  });

  it('flags may precede the reader_id', () => {
    const r = parseSessionArgs(['--lean', '--exemplar', '0', 'reader-xyz']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).toMatchObject({ readerId: 'reader-xyz', mode: 'lean', exemplarOverride: 0 });
  });

  it('rejects a non-numeric --exemplar', () => {
    const r = parseSessionArgs(['abc123', '--exemplar', 'nope']);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('--exemplar expects a number');
  });

  it('rejects a trailing --exemplar with no value', () => {
    const r = parseSessionArgs(['abc123', '--exemplar']);
    expect(r.ok).toBe(false);
  });

  it('requires a reader_id when not push-only', () => {
    const r = parseSessionArgs(['--lean']);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('Usage');
  });

  it('--push-only does NOT require a reader_id', () => {
    const r = parseSessionArgs(['--push-only']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args.pushOnly).toBe(true);
    expect(r.args.readerId).toBeUndefined();
  });

  it('--push-only still parses mode and exemplar (for a pinned-voice push)', () => {
    const r = parseSessionArgs(['--push-only', '--lean', '--exemplar', '2']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).toMatchObject({ pushOnly: true, mode: 'lean', exemplarOverride: 2 });
  });

  it('--push-only tolerates a stray reader_id (ignored downstream)', () => {
    const r = parseSessionArgs(['--push-only', 'abc123']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args.pushOnly).toBe(true);
  });
});
