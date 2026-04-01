# Feature: Custom Summary Prompt UI

**Status**: Not Started
**Last Updated**: 2026-04-01
**Dependencies**: Phase 5 ✅ (API + validation already implemented)
**Related Tech Debt**: TD-004 in [technical-debt.md](../REFERENCE/technical-debt.md)

---

## Overview

The Settings page currently only exposes sync interval configuration. The API already fully supports custom summary prompts — including Zod validation, prompt injection prevention, and storage in `users.summary_prompt` — but there is no UI to set or edit it.

This feature adds a prompt editor to the Settings page so users can personalise how Ansible summarises their reading items.

---

## What Already Exists

- `PATCH /api/settings` accepts `summary_prompt` (validated: 10–2000 chars, injection-safe)
- `users.summary_prompt TEXT` column exists and is read by `src/lib/perplexity-api.ts`
- `SettingsContent.tsx` already fetches and types `summary_prompt: string | null`
- Default prompt is applied server-side when `summary_prompt` is null

Nothing new needs to be built at the API or database layer.

---

## Scope

### UI Changes (Settings Page)

Add to `src/app/settings/SettingsContent.tsx`:

1. **Textarea** for editing the prompt (autofocus on load if empty, pre-filled with current value)
2. **Placeholder text** showing the default prompt so the user understands what they are customising
3. **Character counter** — live count, turns red approaching 2000 chars
4. **"Reset to default" button** — clears the saved prompt (sends `null` to API)
5. **Save button** — same UX pattern as existing sync interval save
6. **Info text** — one line explaining that custom prompts only affect new summaries, not existing ones

### Validation (client-side, mirrors existing API rules)

- Min 10 characters
- Max 2000 characters
- Show inline error on violation (consistent with existing error handling patterns)

### Out of Scope

- Rich text / markdown in prompts (plain text only, consistent with v1 approach)
- Prompt history or versioning
- Per-item prompt overrides
- Previewing summary output with the new prompt

---

## Acceptance Criteria

- [ ] User can view and edit their custom summary prompt in Settings
- [ ] Character counter shown, hard limit enforced at 2000 chars
- [ ] "Reset to default" clears the prompt (next summaries use system default)
- [ ] Save/reset gives clear success/error feedback
- [ ] Info text clarifies existing summaries are not regenerated
- [ ] All new UI covered by tests (95%+ coverage maintained)
- [ ] Type checking passes (`npx tsc --noEmit`)

---

## Testing Strategy

- Unit tests for validation logic (min/max length)
- Component tests: textarea renders with current value, save triggers PATCH, reset sends null
- Error state: shows message when save fails
- No API changes needed — mock existing `PATCH /api/settings` endpoint

---

## Reference

- API validation: `src/app/api/settings/route.ts`
- Perplexity usage of prompt: `src/lib/perplexity-api.ts`
- Settings UI: `src/app/settings/SettingsContent.tsx`
- Tech debt entry: [TD-004](../REFERENCE/technical-debt.md)
