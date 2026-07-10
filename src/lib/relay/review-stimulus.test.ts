// ABOUT: Tests for review-stimulus — reconstruct a piece's stimulus + build Reader deep-links

import { describe, it, expect } from 'vitest';
import { readerDeepLink, buildPieceStimulusView } from './review-stimulus';
import type { StimulusRow } from './session-run';

const fullRow: StimulusRow = {
  title: 'Faith in the Possible',
  short_summary: 'Reid Hoffman frames tech as a faith-driven movement.',
  commentariat_summary: 'It is advocacy, not analysis.',
  tags: ['techno-optimism', 'silicon valley'],
  document_note: 'Who wields the tool, and to what end?',
};

describe('readerDeepLink', () => {
  it('builds the Readwise Reader URL from a reader_id', () => {
    expect(readerDeepLink('01kq254pk2f4vwfatj9pwf6qnh')).toBe(
      'https://read.readwise.io/read/01kq254pk2f4vwfatj9pwf6qnh',
    );
  });
});

describe('buildPieceStimulusView', () => {
  it('reconstructs the stimulus and a titled Reader link for a full item', () => {
    const map = new Map([['r1', fullRow]]);
    const view = buildPieceStimulusView(['r1'], map);
    expect(view.stimulus).toContain('Title: Faith in the Possible');
    expect(view.stimulus).toContain('Tags: techno-optimism, silicon valley');
    expect(view.stimulus).toContain('Note:\nWho wields the tool, and to what end?');
    expect(view.readerLinks).toEqual([
      { readerId: 'r1', title: 'Faith in the Possible', url: 'https://read.readwise.io/read/r1' },
    ]);
  });

  it('still shows a Reader link (falling back to the id) when the item is missing', () => {
    const view = buildPieceStimulusView(['gone'], new Map());
    expect(view.stimulus).toBeNull();
    expect(view.readerLinks).toEqual([
      { readerId: 'gone', title: 'gone', url: 'https://read.readwise.io/read/gone' },
    ]);
  });

  it('drops only the stimulus text (keeps the link) when an item has no summary', () => {
    const noSummary: StimulusRow = { ...fullRow, short_summary: null };
    const view = buildPieceStimulusView(['r1'], new Map([['r1', noSummary]]));
    expect(view.stimulus).toBeNull();
    expect(view.readerLinks[0].readerId).toBe('r1');
  });

  it('joins multiple refs and links each (braided-stimulus shape)', () => {
    const second: StimulusRow = { ...fullRow, title: 'Second piece', document_note: null, tags: null };
    const map = new Map([['r1', fullRow], ['r2', second]]);
    const view = buildPieceStimulusView(['r1', 'r2'], map);
    expect(view.stimulus).toContain('Title: Faith in the Possible');
    expect(view.stimulus).toContain('Title: Second piece');
    expect(view.readerLinks.map((l) => l.readerId)).toEqual(['r1', 'r2']);
  });

  it('returns an empty view for no refs', () => {
    const view = buildPieceStimulusView([], new Map());
    expect(view.stimulus).toBeNull();
    expect(view.readerLinks).toEqual([]);
  });
});
