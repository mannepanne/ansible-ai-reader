#!/bin/sh
# ABOUT: Regenerates src/types/database.types.ts from the live Supabase schema
# ABOUT: Run after every migration; the Database generic on every Supabase client comes from this file
set -eu
OUT=src/types/database.types.ts
TMP=$(mktemp)
supabase gen types typescript --project-id spqenzpdmatmuvrllskf --schema public > "$TMP"
{
  printf '// ABOUT: Supabase Database types generated from the live schema (do not edit by hand)\n'
  printf '// ABOUT: Regenerate with `npm run db:types` after every migration; the Database generic on every client comes from here\n\n'
  cat "$TMP"
} > "$OUT"
rm -f "$TMP"
echo "Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines). Run npx tsc --noEmit to see what the schema change touches."
