// ABOUT: Relay trusted-source seed — outlets the research tool prefers when several cover a question
// ABOUT: A checked-in config (NOT a DB table): an editable, growing list is Stage 3 (see stage-3-outline)

// Soft steering only — passed to grounded-search as a prompt preference, never a hard domain filter.
// Facts may still come from across the spectrum (the north-star: trusted for accuracy, not for taking
// Relay's side). Kept deliberately small and general-purpose; curation-from-use is a Stage 3 concern.
export const TRUSTED_SOURCES: string[] = [
  'reuters.com',
  'apnews.com',
  'bbc.co.uk',
  'ft.com',
  'economist.com',
  'nature.com',
  'science.org',
  'arxiv.org',
  'gov.uk',
  'europa.eu',
];
