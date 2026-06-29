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

interface MaToolUseEvent extends MaEvent {
  name?: string;
  input?: Record<string, unknown>;
  is_error?: boolean;
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

// recall returns a JSON array of {id, kind, title, ...}; pull the titles for the trace.
function recallTitles(raw: string): string[] | null {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.map((r) => r?.title || `${r?.kind ?? '?'}:${String(r?.id ?? '').slice(0, 8)}`);
    }
  } catch {
    /* not a JSON array — fall through */
  }
  return null;
}

/**
 * Render a human-readable reasoning trace from a session's events: the recall queries the narrator
 * composed (its thinking made visible — what concepts it reached for), the neighbours it got back,
 * any fetches, its interim narration, and whether it wrote or stayed silent. The raw chain-of-thought
 * is not in the event stream (agent.thinking carries no text), so the queries and interim messages
 * are the window into how it decided.
 */
export function renderTrace(events: MaEvent[]): string {
  const lines: string[] = [];
  for (const e of events ?? []) {
    if (e.type === 'agent.thinking') {
      lines.push('  · thinking…');
    } else if (e.type === 'agent.mcp_tool_use') {
      const ev = e as MaToolUseEvent;
      const input = ev.input ?? {};
      if (ev.name === 'recall') {
        const k = input.k ? ` (k=${input.k})` : '';
        lines.push(`  → recall   "${truncate(String(input.stimulus_text ?? ''), 110)}"${k}`);
      } else if (ev.name === 'fetch') {
        lines.push(`  → fetch    ${String(input.id ?? '')}`);
      } else if (ev.name === 'write_pending') {
        const body = String(input.body ?? '');
        const firstLine = body.split('\n').find((l) => l.trim()) ?? body;
        lines.push(`  → write_pending   "${truncate(firstLine, 80)}"`);
      } else {
        lines.push(`  → ${ev.name ?? '?'}   ${truncate(JSON.stringify(input), 80)}`);
      }
    } else if (e.type === 'agent.mcp_tool_result') {
      const raw = (e.content ?? []).map((b) => b.text ?? '').join('');
      if ((e as MaToolUseEvent).is_error) {
        lines.push(`    ← ERROR: ${truncate(raw, 120)}`);
      } else {
        const titles = recallTitles(raw);
        if (titles) {
          lines.push(`    ← ${titles.length} neighbour(s): ${truncate(titles.join('; '), 160)}`);
        } else if (raw.includes('"ok":true')) {
          lines.push('    ← ok');
        } else if (raw) {
          lines.push(`    ← ${truncate(raw, 120)}`);
        }
      }
    } else if (e.type === 'agent.message') {
      const text = textOf(e.content);
      if (text) lines.push(`  💬 ${text}`);
    }
  }
  return lines.join('\n');
}
