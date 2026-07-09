// ABOUT: Tests for Relay curated style exemplars (Channel 1) + the gate-blindness structural guarantee
// ABOUT: selectExemplar rotates deterministically per agent version; the session path never reads Channel-2 columns

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EXEMPLARS, selectExemplar, renderExemplarSection, type Exemplar } from './exemplars';

const sample: Exemplar[] = [
  { title: 'A', body: '# A\n\nfirst' },
  { title: 'B', body: '# B\n\nsecond' },
  { title: 'C', body: '# C\n\nthird' },
];

describe('selectExemplar', () => {
  it('selects deterministically by agent version, rotating through the set', () => {
    expect(selectExemplar(0, sample).title).toBe('A');
    expect(selectExemplar(1, sample).title).toBe('B');
    expect(selectExemplar(2, sample).title).toBe('C');
    expect(selectExemplar(3, sample).title).toBe('A'); // wraps
  });

  it('handles negative / non-finite / fractional indices safely (never throws on a real version)', () => {
    expect(selectExemplar(-1, sample).title).toBe('C');
    expect(selectExemplar(Number.NaN, sample).title).toBe('A');
    expect(selectExemplar(2.9, sample).title).toBe('C'); // truncated to 2
  });

  it('throws only when no exemplars are configured', () => {
    expect(() => selectExemplar(0, [])).toThrow(/no exemplars/);
  });

  it('defaults to the seeded EXEMPLARS, which is non-empty and well-formed', () => {
    expect(EXEMPLARS.length).toBeGreaterThan(0);
    for (const ex of EXEMPLARS) {
      expect(ex.title.trim().length).toBeGreaterThan(0);
      expect(ex.body.trim().length).toBeGreaterThan(0);
    }
    // With the default arg, selection still works over the real list.
    expect(selectExemplar(0).title).toBe(EXEMPLARS[0].title);
  });
});

describe('renderExemplarSection', () => {
  it('wraps the exemplar as a blockquote under the texture heading', () => {
    const out = renderExemplarSection({ title: 'A', body: '# A\n\nfirst line' });
    expect(out).toContain('## The texture to aim for');
    expect(out).toContain('> # A');
    expect(out).toContain('> first line');
    expect(out).toContain('>\n'); // blank body line becomes a bare quote marker
  });
});

// The load-bearing blindness guarantee (spec §H). Because the exemplar is curated checked-in config —
// NOT a DB query — the whole system-prompt assembly path is DB-free, so blindness is structural: there
// is no query that could accidentally pull a Channel-2 column into the agent's context. We assert that
// directly — the assembly modules and the recall SQL never even reference review_note / original_body.
describe('gate-blindness: the writing-session path never references Channel-2 columns', () => {
  const repoRoot = path.join(__dirname, '..', '..', '..');
  const CHANNEL2 = ['review_note', 'original_body'];
  const sessionPathFiles = [
    'src/lib/relay/persona.ts', // system-prompt assembly
    'src/lib/relay/exemplars.ts', // the Channel-1 anchor (must not read the DB)
    // The actual runtime read path that feeds the agent: recall() (via the RPC) and fetchById() hand a
    // self-piece's body back to the agent — the one door that opens onto piece rows.
    'src/lib/relay/tools.ts',
    'supabase/migrations/20260622_add_relay_recall_fn.sql', // the recall query the agent's tool runs
  ];

  it.each(sessionPathFiles)('%s names no Channel-2 column', (rel) => {
    const src = fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
    for (const col of CHANNEL2) {
      expect(src.includes(col)).toBe(false);
    }
  });

  // The name check above only catches an EXPLICIT `original_body` reference. A wildcard `select('*')`
  // names no column yet would pull every column into the agent's reach — so guard that separately: the
  // session read path must select explicit columns. This is what makes the "no leak" guarantee robust
  // against a future regression, not just true today (the property the whole phase rests on).
  it('the session read path uses explicit column selects, never select(*)', () => {
    const toolsSrc = fs.readFileSync(path.join(repoRoot, 'src/lib/relay/tools.ts'), 'utf-8');
    expect(toolsSrc).not.toMatch(/\.select\(\s*['"`]\s*\*/);
  });

  it('exemplars.ts does not import supabase/embed (assembly stays DB-free)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/lib/relay/exemplars.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]@supabase/);
    expect(src).not.toMatch(/from ['"]\.\/embed/);
  });
});
