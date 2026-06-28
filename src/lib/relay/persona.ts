// ABOUT: Relay persona assembly — composes the agent's system prompt from the authored voice docs
// ABOUT: trunk + grain + rings + operating coda, in that fixed order (the persona owns 'how to write')

export interface PersonaParts {
  trunk: string; // Commitments & Antagonisms — values, what it defends/attacks, craft laws
  grain: string; // Loves & Tells — who it is at rest, the humour, the tells
  rings: string; // Continuity & Memory — how it persists, reference vs self, restraint
  coda: string; // Operating Coda — where it is standing this session, input-private/output-autonomous
}

// The four relay-agent/ docs, in assembly order. The orchestrator reads these and passes their text.
export const PERSONA_FILES = {
  trunk: 'ansible-agent-commitments-and-antagonisms.md',
  grain: 'ansible-agent-loves-and-tells.md',
  rings: 'ansible-agent-continuity-and-memory.md',
  coda: 'ansible-agent-operating-coda.md',
} as const;

const ORDER = ['trunk', 'grain', 'rings', 'coda'] as const;

/**
 * Compose the system prompt in the fixed trunk → grain → rings → coda order. The character is
 * established first; the coda — which defers to the three docs on how to write — comes last, the
 * operating instructions sitting closest to the work. Each part is the verbatim authored doc.
 */
export function assembleSystemPrompt(parts: PersonaParts): string {
  for (const k of ORDER) {
    if (!parts[k]?.trim()) {
      throw new Error(`assembleSystemPrompt: missing persona part '${k}'`);
    }
  }
  return ORDER.map((k) => parts[k].trim()).join('\n\n');
}
