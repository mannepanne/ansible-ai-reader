// ABOUT: Tests for Relay persona assembly — the system prompt is trunk + grain + rings + coda, in order
// ABOUT: Order is load-bearing (the coda defers to the three docs and must come last)

import { describe, it, expect } from 'vitest';
import { assembleSystemPrompt, PERSONA_FILES } from './persona';

describe('assembleSystemPrompt', () => {
  it('joins the five parts in trunk → grain → rings → cadence → coda order', () => {
    const out = assembleSystemPrompt({ trunk: 'TRUNK', grain: 'GRAIN', rings: 'RINGS', cadence: 'CADENCE', coda: 'CODA' });
    expect(out).toBe('TRUNK\n\nGRAIN\n\nRINGS\n\nCADENCE\n\nCODA');
    expect(out.indexOf('TRUNK')).toBeLessThan(out.indexOf('GRAIN'));
    expect(out.indexOf('GRAIN')).toBeLessThan(out.indexOf('RINGS'));
    expect(out.indexOf('RINGS')).toBeLessThan(out.indexOf('CADENCE'));
    expect(out.indexOf('CADENCE')).toBeLessThan(out.indexOf('CODA'));
  });

  it('trims each part so doc trailing whitespace does not bloat the prompt', () => {
    expect(assembleSystemPrompt({ trunk: ' a \n', grain: 'b', rings: 'c', cadence: 'd', coda: 'e ' })).toBe(
      'a\n\nb\n\nc\n\nd\n\ne',
    );
  });

  it('throws if any part is missing or blank', () => {
    expect(() => assembleSystemPrompt({ trunk: 'a', grain: 'b', rings: 'c', cadence: 'd', coda: '  ' })).toThrow(/coda/);
    expect(() => assembleSystemPrompt({ trunk: '', grain: 'b', rings: 'c', cadence: 'd', coda: 'e' } as never)).toThrow(/trunk/);
    expect(() => assembleSystemPrompt({ trunk: 'a', grain: 'b', rings: 'c', coda: 'e' } as never)).toThrow(/cadence/);
  });

  it('maps the five parts to their relay-agent/ filenames in order', () => {
    expect(PERSONA_FILES.trunk).toContain('commitments');
    expect(PERSONA_FILES.grain).toContain('loves');
    expect(PERSONA_FILES.rings).toContain('continuity');
    expect(PERSONA_FILES.cadence).toContain('craft-and-cadence');
    expect(PERSONA_FILES.coda).toContain('operating-coda');
  });
});
