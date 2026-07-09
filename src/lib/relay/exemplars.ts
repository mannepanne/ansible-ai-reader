// ABOUT: Relay curated style exemplars (Channel 1) — the on-page "texture to aim for" anchor.
// ABOUT: A checked-in, hand-curated list of approved pieces; one is selected per agent version.
//
// Stage 2.2a, Channel 1 (positive, agent-visible). Approved pieces are already the agent's memory (the
// recall corpus), so anchoring the voice on one reveals no gate outcome — it is blindness-safe. This
// list is CURATED, not auto-drawn from the corpus: feeding the agent its own greatest hits would
// entrench its tics (the opposite of "kill fixed tics via varied material"), so a human picks what
// counts as exemplary. Curated text is copied in here at curation time (like trusted-sources.ts) — the
// assembly path stays DB-free, which is what keeps gate-blindness structural (no query to get wrong).
//
// To add an exemplar: pick one of your best APPROVED pieces and paste its title + body below. Rotation
// happens per agent version (see selectExemplar), so a growing list keeps the anchor varied over time.

export interface Exemplar {
  title: string;
  /** The piece body, plain (no blockquote prefixes) — renderExemplarSection adds the framing. */
  body: string;
}

// Seeded with the piece that was formerly hardcoded in ansible-agent-craft-and-cadence.md. Add more
// curated approved pieces here over time; each new entry widens the rotation.
export const EXEMPLARS: Exemplar[] = [
  {
    title: 'Seeing like a vendor',
    body: `# Seeing like a vendor

A state guards the location of its missile submarines more carefully than almost anything else it knows. The reason is plain: a boat that can be found can be sunk, and a deterrent that can be sunk deters no one.

You can guard that secret perfectly and still lose it — not because someone breaks in, but because it was never in one place. It is spread across a hundred dull, unclassified facts: a maintenance schedule, a procurement line, who took leave and when, the power draw at a particular dock. None of them secret. All of them readable together by a system built to read things together. The submarine surfaces in the metadata.

That is what a few Ministry of Defence engineers have been trying to say, and it reaches well past submarines. A state's oldest power was never owning things. It was the power to read itself — to count its people, map its ground, know what it has. A state that can see itself can tax, defend, and plan. Hand that lens to someone else and you have given away the part that mattered, while keeping the files and feeling safe because the files are still yours.

So the official line — the data stays ours, the sovereignty is intact — is not quite a lie. You can keep every byte on home soil and still have handed over the only thing that made the bytes worth keeping: the power to turn them into a picture. The department owns the data. The vendor owns the reading of it. And the reading belongs, in practice, to whoever built the tool and whose tool sharpens every time it is used.

This is not unique to defence. For a decade the value has been sliding off the thing and onto the layer that reads the thing. You did not hand over your data; you handed over your shadow, and the shadow turned out to be the part worth having. It used to take a specialist. Now any large model will infer the hidden fact from a heap of unhidden ones — including the one asked to draft the warning about it.

And once that picture is what the department runs on, leaving stops being possible. The exit was sold off with the entrance. Make yourself necessary, then change the terms: the same play as the platform that rots once no one can switch away, arrived now at the desk where a country keeps its defence.

Worse, because the firm holding the lens answers to another government — one that treats the old arrangements as up for renegotiation whenever it suits. The Swiss looked at this and said no. Sovereignty that depends on someone else's goodwill, and can be switched off, is not sovereignty. It is a subscription.

And the body read most closely is not the ministry. It is everyone the picture is of — the people who signed nothing, were asked nothing, and are now the most legible population in the country to a company most of them could not name.

The fix is dull, which is why it keeps losing to the demo: keep the power to read yourself in your own hands, even when your own version is slower and uglier. A state should be the one thing in the room that knows itself best. Sell that off and you are seen clearly by everyone except yourself.`,
  },
];

/**
 * Select one exemplar deterministically by agent version. Rotation is per-agent-version (not per
 * session): production bakes the system prompt into the pinned agent resource, so the exemplar can only
 * vary when the voice is re-pushed. A safe modulo handles negative/zero/undefined-derived indices.
 */
export function selectExemplar(versionIndex: number, exemplars: Exemplar[] = EXEMPLARS): Exemplar {
  if (exemplars.length === 0) {
    throw new Error('selectExemplar: no exemplars configured');
  }
  const n = exemplars.length;
  const i = Math.trunc(Number.isFinite(versionIndex) ? versionIndex : 0);
  return exemplars[((i % n) + n) % n];
}

/**
 * Render the "texture to aim for" craft section around a chosen exemplar, as a blockquote — the same
 * shape the exemplar formerly had inline in the craft doc. Assembled into the cadence part so it stays
 * within craft & cadence, before the coda.
 */
export function renderExemplarSection(ex: Exemplar): string {
  const quoted = ex.body
    .split('\n')
    .map((line) => (line.length ? `> ${line}` : '>'))
    .join('\n');
  return `## The texture to aim for

Here is a piece at the density you should be writing at — plain sentences doing the work, one flourish held to the end, no announced turns, no greengrocer, no commentary on its own cleverness. This is the band to land in.

${quoted}`;
}
