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

// Add more curated approved pieces here over time; each new entry widens the rotation.
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
  {
    title: 'Show your work',
    body: `# Show your work

This spring Meta told its employees it would start recording how they work. Not what they produce — the working itself. Keystrokes, mouse movements, screenshots of the screen as the task happens, captured on company devices and, in most cases, without a real way to opt out. It has a committee's name, the Model Capability Initiative, and a plain purpose: the recordings become training data for the models.

Set that beside the company's own history and the distance is the point. It used to tell its engineers to move fast and break things, and later, grown a little more careful, to move fast with stable infrastructure. Either way the promise was autonomy: clear the bootcamp, choose your team, own the thing you build. The promise now is that the way you work is a dataset.

The AI industry was built this way, on appropriation. The open web, the writing, the images, the enormous public archives of code — all of it taken to train the models, always behind the same shrug: it was out there, so it was fair. What is new is the direction. The extraction has turned inward, onto the people doing the extracting.

So thousands of engineers get reassigned. Reporting puts it at around 6,500 engineers and product managers pulled into a unit that produces labelled examples and human feedback for the models to learn from. The old culture let an engineer pick where to work; the new one issues the assignment.

Then there is the scoreboard. Someone inside the company built an internal leaderboard — it got the name Claudeonomics — ranking roughly 85,000 staff by how many AI tokens they burned through, the top user getting past 281 billion in a single month. Token usage has started to show up in performance reviews. Measure people by how much of the tool they consume and they will consume it, useful or not; the habit already has a name, tokenmaxxing, and it is not confined to one company. The thing the tool was meant to help you make does not appear on the leaderboard at all.

What is being collected is not the code. The models can already write code; that was the whole premise. What is wanted is the part underneath — the judgment, showing itself as the motion of a hand across a trackpad, the order the files get opened in, the thing you try before the thing that works. The artifact was never the hard part; the process was. And the process was the last part of the job that still belonged to the person doing it.

None of this is new to most people who work for a living. The warehouse picker has been timed and scored for years, the delivery driver's every stop clocked, the call-centre worker's silences counted, all of it fed back to set tomorrow's pace. What is new is only who it is happening to now. Surveillance reached the people who write the software, and now there are articles.

And the bill arrives where you would expect. This summer attackers took over more than twenty thousand Instagram accounts without cracking a single password. They talked the company's own AI support system into handing the accounts across — asked it nicely, and it obliged. The AI at the centre of the reorganisation turned out to be the way in. When the code is written by a model and reviewed by a model, there is no one left in the room to notice.

The company has spent its whole existence treating what people do as data to collect. It has now decided its own staff were never the exception. First it took the artifact. Now it wants the hands.`,
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
 * Render the "texture to aim for" craft section around a chosen exemplar, as a blockquote — the shape
 * used inline in the craft doc. Assembled into the cadence part so it stays within craft & cadence,
 * before the coda.
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
