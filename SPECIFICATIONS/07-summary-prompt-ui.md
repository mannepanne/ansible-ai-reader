# Feature: Custom Summary Prompt (End-to-End)

**Status**: In Progress
**Last Updated**: 2026-04-01
**Dependencies**: Phase 5 ✅ (storage API + validation already implemented)
**Related Tech Debt**: TD-004 in [technical-debt.md](../REFERENCE/technical-debt.md)

---

## Overview

Users can save a custom summary prompt via the Settings API, but it was never wired up to Perplexity — `generateSummary` has no prompt parameter and the consumer worker never fetches or passes it. Building only the UI would let users save a prompt that gets silently ignored.

This feature implements the full chain: wiring the saved prompt into summary generation, then exposing it in the Settings UI.

---

## What Already Exists

- `PATCH /api/settings` accepts `summary_prompt` (validated: 10–2000 chars, injection-safe)
- `GET /api/settings` returns `summary_prompt: string | null`
- `users.summary_prompt TEXT` column exists in the database
- `SettingsContent.tsx` already fetches and types `summary_prompt: string | null`

## What Does NOT Exist (and must be built)

- `generateSummary()` has no `customPrompt` parameter — prompt is hardcoded
- `workers/consumer.ts` never fetches `users.summary_prompt` or passes it to `generateSummary`
- No UI in Settings to view or edit the prompt

---

## Scope

### Part 1: Wire prompt into `generateSummary` (`src/lib/perplexity-api.ts`)

- Add optional `customPrompt?: string` parameter to `generateSummary()`
- When provided, prepend to the user message so Perplexity uses it as context
- Default behaviour unchanged when `customPrompt` is absent

### Part 2: Consumer worker fetches and passes the prompt (`workers/consumer.ts`)

- After fetching article content, query `users.summary_prompt` for the item's owner
- Pass it to `generateSummary` if present
- Failure to fetch the prompt should not block summary generation (fall back to default)

### Part 3: Settings UI (`src/app/settings/SettingsContent.tsx`)

1. **Textarea** pre-filled with saved prompt, or empty with placeholder showing the default
2. **Character counter** — live count, turns red approaching 2000 chars
3. **"Reset to default" button** — sends `null` to clear the saved prompt
4. **Single save button** — saves both sync interval and prompt together (existing pattern)
5. **Info text** — one line: custom prompts only affect new summaries, not existing ones

### Validation (client-side, mirrors existing API rules)

- Min 10 characters (if non-empty — empty means "use default")
- Max 2000 characters
- Show inline error on violation

### Out of Scope

- Rich text / markdown in prompts (plain text only)
- Prompt history or versioning
- Per-item prompt overrides
- Previewing summary output with the new prompt

---

## Acceptance Criteria

- [ ] `generateSummary` accepts and applies an optional `customPrompt` parameter
- [ ] Consumer worker fetches `summary_prompt` and passes it to `generateSummary`
- [ ] Prompt fetch failure falls back gracefully (default prompt used, no crash)
- [ ] User can view and edit their custom summary prompt in Settings
- [ ] Character counter shown, hard limit enforced at 2000 chars
- [ ] "Reset to default" clears the prompt (next summaries use system default)
- [ ] Save/reset gives clear success/error feedback
- [ ] Info text clarifies existing summaries are not regenerated
- [ ] All new code covered by tests (95%+ coverage maintained)
- [ ] Type checking passes (`npx tsc --noEmit`)

---

## Testing Strategy

- `perplexity-api.ts`: unit tests for `generateSummary` with/without `customPrompt`
- `consumer.ts`: test that prompt is fetched and passed; test fallback when fetch fails
- `SettingsContent.tsx`: textarea renders with saved value, save triggers PATCH with both fields, reset sends `null`, character counter, error states

---

## Reference

- API validation: `src/app/api/settings/route.ts`
- Summary generation: `src/lib/perplexity-api.ts` — `generateSummary()` line 293
- Consumer worker: `workers/consumer.ts` — `generateSummary` call line 199
- Settings UI: `src/app/settings/SettingsContent.tsx`
- Tech debt entry: [TD-004](../REFERENCE/technical-debt.md)
