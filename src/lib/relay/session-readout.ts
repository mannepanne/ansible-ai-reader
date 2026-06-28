// ABOUT: Relay session readout — extracts what the orchestrator needs from a finished MA session
// ABOUT: the agent's closing text (the declined reason) and any mid-session fetch degradation

export interface MaContentBlock {
  type: string;
  text?: string;
}

export interface MaEvent {
  type: string;
  content?: MaContentBlock[];
  [k: string]: unknown;
}

export interface SessionReadout {
  // The agent's final message text — its closing reasoning (the 'reason' recorded for a silence).
  closingText: string | null;
  // 'summary_only' if a fetch degraded mid-session (the bridge marks it in the tool result JSON).
  degraded: string | null;
}

function textOf(blocks: MaContentBlock[] | undefined): string {
  return (blocks ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
}

/**
 * Read a finished Managed Agent session's event list for the two things the decision-finalize step
 * needs from the transcript: the agent's closing text, and whether a fetch degraded. The verdict and
 * piece id are NOT read here — those come from DB state behind the bridge (the agent stays blind),
 * so this readout never has to detect write_pending or cross the agent's blindness boundary.
 */
export function readSession(events: MaEvent[]): SessionReadout {
  let closingText: string | null = null;
  let degraded: string | null = null;

  for (const e of events ?? []) {
    if (e.type === 'agent.message') {
      const text = textOf(e.content);
      // Keep the last NON-EMPTY agent message: a trailing empty/tool-only turn must not blank it.
      if (text) {
        closingText = text;
      }
    } else if (e.type === 'agent.mcp_tool_result') {
      const raw = (e.content ?? []).map((b) => b.text ?? '').join('');
      if (raw.includes('"degraded":"summary_only"')) {
        degraded = 'summary_only';
      }
    }
  }

  return { closingText, degraded };
}
