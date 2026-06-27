// ABOUT: Tests for the Relay sealed embedding helper
// ABOUT: Verifies the bge-m3 call shape, dimension validation, and error handling

import { describe, it, expect, vi } from 'vitest';
import { embed, EMBEDDING_MODEL, EMBEDDING_DIM, type AiBinding } from './embed';

function fakeAi(run: AiBinding['run']): AiBinding {
  return { run };
}

const validVector = () => Array.from({ length: EMBEDDING_DIM }, (_, i) => i / EMBEDDING_DIM);

describe('embed', () => {
  it('returns the embedding vector from the model response', async () => {
    const vector = validVector();
    const run = vi.fn().mockResolvedValue({ data: [vector] });
    const result = await embed(fakeAi(run), 'hello world');
    expect(result).toEqual(vector);
    expect(result).toHaveLength(EMBEDDING_DIM);
  });

  it('calls bge-m3 with the trimmed text and truncate_inputs enabled', async () => {
    const run = vi.fn().mockResolvedValue({ data: [validVector()] });
    await embed(fakeAi(run), '  spaced text  ');
    expect(run).toHaveBeenCalledWith(EMBEDDING_MODEL, {
      text: 'spaced text',
      truncate_inputs: true,
    });
  });

  it('throws on empty or whitespace-only text without calling the model', async () => {
    const run = vi.fn();
    await expect(embed(fakeAi(run), '   ')).rejects.toThrow(/empty text/);
    expect(run).not.toHaveBeenCalled();
  });

  it('throws when the response has no data array', async () => {
    const run = vi.fn().mockResolvedValue({ shape: [1, EMBEDDING_DIM] });
    await expect(embed(fakeAi(run), 'x')).rejects.toThrow(/unexpected embedding shape/);
  });

  it('throws when the vector dimension is wrong', async () => {
    const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });
    await expect(embed(fakeAi(run), 'x')).rejects.toThrow(/unexpected embedding shape/);
  });
});
