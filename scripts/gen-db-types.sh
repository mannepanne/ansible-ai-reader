#!/bin/sh
# ABOUT: Regenerates src/types/database.types.ts from the live Supabase schema
# ABOUT: Run after every migration; the Database generic on every Supabase client comes from this file
set -eu
# Needs the Supabase CLI installed and logged in (`supabase login`). The ref is not a secret; override it for a fork.
PROJECT_ID="${SUPABASE_PROJECT_ID:-spqenzpdmatmuvrllskf}"
OUT=src/types/database.types.ts
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# Written to a temp file first so a failed generation cannot truncate the committed snapshot
supabase gen types typescript --project-id "$PROJECT_ID" --schema public > "$TMP"
{
  printf '// ABOUT: Supabase Database types generated from the live schema (do not edit by hand)\n'
  printf '// ABOUT: Regenerate with `npm run db:types` after every migration; the Database generic on every client comes from here\n\n'
  cat "$TMP"
} > "$OUT"
echo "Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines). Run npx tsc --noEmit to see what the schema change touches."
