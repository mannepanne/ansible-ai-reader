// ABOUT: Reconstruct the stimulus a pending/decided Relay piece was written from + Readwise Reader
// ABOUT: deep-links, for the admin review screen. RECONSTRUCTION (current logic), not stored text.

import { formatStimulus, type StimulusRow } from './session-run';

export interface ReaderLink {
  readerId: string;
  title: string;
  url: string;
}

export interface PieceStimulusView {
  /** Reconstructed stimulus text (current formatStimulus logic), or null if nothing to show. */
  stimulus: string | null;
  readerLinks: ReaderLink[];
}

/** The Readwise Reader deep-link for a document by its Reader id. */
export function readerDeepLink(readerId: string): string {
  return `https://read.readwise.io/read/${readerId}`;
}

/**
 * Reconstruct what a piece's stimulus looks like *today* (via formatStimulus) from the reader_items
 * behind its stimulus_ref, and build Reader deep-links. This is a RECONSTRUCTION with the current
 * assembler — a piece written before an assembler change (e.g. pre-2.3a, before Tags/Note existed)
 * renders lines it never actually saw, so the UI must label this "reconstructed", not "as sent".
 * A ref whose item is missing, or whose row has no summary (formatStimulus throws), still contributes
 * a Reader link — only its stimulus text is dropped.
 */
export function buildPieceStimulusView(
  stimulusRefs: string[],
  itemsByReaderId: Map<string, StimulusRow>,
): PieceStimulusView {
  const readerLinks: ReaderLink[] = stimulusRefs.map((readerId) => {
    const item = itemsByReaderId.get(readerId);
    return { readerId, title: item?.title?.trim() || readerId, url: readerDeepLink(readerId) };
  });

  const parts: string[] = [];
  for (const readerId of stimulusRefs) {
    const item = itemsByReaderId.get(readerId);
    if (!item) continue;
    try {
      parts.push(formatStimulus(item));
    } catch {
      // no summary to reconstruct (deleted since, or never had one) — the Reader link still shows
    }
  }
  return { stimulus: parts.length ? parts.join('\n\n———\n\n') : null, readerLinks };
}
