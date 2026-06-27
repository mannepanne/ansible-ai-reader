// ABOUT: Sealed embedding helper for Relay — turns text into a bge-m3 vector via Workers AI
// ABOUT: The single embed path shared by recall and approval, so stored vectors never drift

export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const EMBEDDING_DIM = 1024;

// Minimal structural type for the Workers AI binding, so this module stays testable and
// does not hard-depend on the global `Ai` type. The real `env.AI` satisfies it structurally.
export interface AiBinding {
  run(
    model: string,
    input: { text: string | string[]; truncate_inputs?: boolean },
  ): Promise<unknown>;
}

/**
 * Embed a single string into a 1024-dim bge-m3 vector.
 *
 * `truncate_inputs: true` lets the model truncate rather than error when input exceeds the
 * 60k-token context window (relevant for long piece bodies; reference summaries are well under).
 *
 * NOTE (first-real-run smoke test): the `{ data: number[][] }` response shape is the established
 * Workers AI embedding output but is not pinned in the bge-m3 docs — confirm against a live call.
 */
export async function embed(ai: AiBinding, text: string): Promise<number[]> {
  const trimmed = text?.trim();
  if (!trimmed) {
    throw new Error('embed: refusing to embed empty text');
  }

  const result = (await ai.run(EMBEDDING_MODEL, {
    text: trimmed,
    truncate_inputs: true,
  })) as { data?: number[][] };

  const vector = result?.data?.[0];
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `embed: unexpected embedding shape from ${EMBEDDING_MODEL} (expected a ${EMBEDDING_DIM}-dim vector)`,
    );
  }
  return vector;
}
