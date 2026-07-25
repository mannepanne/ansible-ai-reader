// ABOUT: Tests for the Relay session-run core — the pure formatStimulus assembler

import { describe, it, expect } from 'vitest';
import { formatStimulus } from './session-run';

// A fully-engaged item: every enrichment field present. Used across the enrichment + blindness tests.
const engagedRow = {
  title: 'Seeing like a vendor',
  short_summary: 'The submarine surfaces in the metadata.',
  commentariat_summary: 'But procurement is boring.',
  tags: ['sovereignty', 'surveillance', 'defence'],
  document_note: 'The exit was sold off with the entrance.',
  reader_note: null,
};

describe('formatStimulus', () => {
  it('assembles title + summary + counter-case', () => {
    const out = formatStimulus({
      title: 'Seeing like a vendor',
      short_summary: 'The submarine surfaces in the metadata.',
      commentariat_summary: 'But procurement is boring.',
      tags: null,
      document_note: null,
      reader_note: null,
    });
    expect(out).toContain('Title: Seeing like a vendor');
    expect(out).toContain('Summary:\nThe submarine surfaces in the metadata.');
    expect(out).toContain('Counter-case:\nBut procurement is boring.');
  });

  it('works with just a summary (no counter-case)', () => {
    const out = formatStimulus({ title: 'T', short_summary: 'A point.', commentariat_summary: null, tags: null, document_note: null, reader_note: null });
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

  it('enriches with a Reader-authored note when there is no Ansible note (2.3b)', () => {
    const out = formatStimulus({ ...engagedRow, document_note: null, reader_note: 'Marked on the train.' });
    expect(out).toContain('Note:\nMarked on the train.');
  });

  it('merges both note sources under one Note block (2.3b)', () => {
    const out = formatStimulus({ ...engagedRow, document_note: 'Ansible thought.', reader_note: 'Reader thought.' });
    expect(out).toContain('Note:\nAnsible thought.\nReader thought.');
    expect(out.match(/Note:/g)?.length).toBe(1); // single label, not two
  });

  it('dedups an identical note that round-tripped Ansible→Reader (2.3b)', () => {
    const out = formatStimulus({ ...engagedRow, document_note: 'Same thought.', reader_note: 'Same thought.' });
    expect(out).toContain('Note:\nSame thought.');
    expect((out.match(/Same thought\./g) ?? []).length).toBe(1); // shown once, not twice
  });

  it('drops the Reader note in lean mode', () => {
    const out = formatStimulus({ ...engagedRow, reader_note: 'Reader thought.' }, 'lean');
    expect(out).not.toContain('Reader thought.');
    expect(out).not.toContain('Note:');
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
      formatStimulus({ title: 'T', short_summary: null, commentariat_summary: 'c', tags: ['a'], document_note: 'n', reader_note: null }, 'lean'),
    ).toThrow(/summary/);
  });

  it('throws when there is no summary text, even with tags/note present (summary-guard)', () => {
    expect(() => formatStimulus({ title: 'T', short_summary: null, commentariat_summary: null, tags: null, document_note: null, reader_note: null })).toThrow(/summary/);
    expect(() => formatStimulus({ title: 'T', short_summary: '   ', commentariat_summary: null, tags: null, document_note: null, reader_note: null })).toThrow(/summary/);
    // enrichment parts must not let a summary-less item satisfy the guard and spend a session
    expect(() => formatStimulus({ title: 'T', short_summary: null, commentariat_summary: 'c', tags: ['a'], document_note: 'n', reader_note: null })).toThrow(/summary/);
  });
});

// The session create/poll/read steps (createSession/getSession/getSessionEvents) are exercised
// through the orchestrator DO's tests; this file covers the pure formatStimulus assembler.
