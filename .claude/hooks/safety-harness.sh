#!/bin/bash
# ABOUT: PreToolUse hook — guardrail against honest mistakes on Bash tool calls.
# ABOUT: Two tiers (block/ask) calibrated for less-experienced users.
#
# Spec: SPECIFICATIONS/ARCHIVE/pretooluse-safety-harness.md
# Pattern set adapted from https://github.com/davekilleen/Dex/blob/main/.claude/hooks/dex-safety-guard.sh
# JSON contract per https://docs.claude.com/en/docs/claude-code/hooks.md (current shape).
#
# Bypass: prefix the command inline with SAFETY_HARNESS_OFF=1, e.g.
#   SAFETY_HARNESS_OFF=1 rm -rf ~/old-project
# Setting it in a Claude Code Bash tool call does NOT persist to the next call
# (each tool call is a fresh shell). Use parent-shell export only when launching
# claude itself with the harness off for an entire session — not recommended.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/parse-tool-input.sh"

INPUT=$(cat)
parse_tool_input "$INPUT" "command"
COMMAND="$TOOL_INPUT_VALUE"

# Defensive: only operate on Bash. Hook is registered with matcher "Bash" but if
# the matcher behaviour ever changes, fail safe by allowing other tools through.
if [ "${TOOL_NAME:-}" != "Bash" ]; then
    exit 0
fi

# Escape hatch — two forms:
#   1. Inline-prefix on the command itself (the documented primary form):
#        SAFETY_HARNESS_OFF=1 rm -rf ~/old-project
#      The user types this; the hook sees it in the command string and
#      short-circuits before pattern matching. The actual shell that runs
#      the command also picks up the env var, but the hook would never see
#      it via its own environment because Claude Code spawns the hook
#      before the command shell exists.
#   2. Parent-shell export (set before launching `claude`):
#        export SAFETY_HARNESS_OFF=1
#        claude
#      The env var is in claude's process and propagates to every hook
#      invocation. Heavy-handed; not recommended except for short
#      maintenance sessions.
if printf '%s' "$COMMAND" | grep -qE '^[[:space:]]*SAFETY_HARNESS_OFF=1[[:space:]]+'; then
    echo "[safety-harness] disabled via inline SAFETY_HARNESS_OFF prefix" >&2
    exit 0
fi
if [ "${SAFETY_HARNESS_OFF:-}" = "1" ]; then
    echo "[safety-harness] disabled via SAFETY_HARNESS_OFF (parent-shell export)" >&2
    exit 0
fi

# Emit JSON output for a hookSpecificOutput response. Argument 1 is the decision
# (deny/ask); argument 2 is the user-visible reason. Only deny and ask are used
# in v1 — see "Why no warn tier?" in REFERENCE/safety-harness.md for the
# implementation finding that systemMessage does not render in interactive
# Claude Code, leading to chmod 777 being moved from warn to ask.
emit() {
    local decision="$1"
    local text="$2"
    python3 -c "
import json, sys
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'permissionDecision': sys.argv[1],
        'permissionDecisionReason': sys.argv[2]
    }
}))
" "$decision" "$text"
    exit 0
}

BYPASS_HINT='Prefix the command inline with SAFETY_HARNESS_OFF=1 if you really mean it.'

# === BLOCK TIER ===

# rm -rf against root, home, $HOME, /Users. Catches the common short-flag forms
# (-rf, -fr, -Rf, etc.). Long-form (--recursive --force) and split-flag forms
# (-r -f) are not caught — see spec §Compound-command coverage.
if printf '%s' "$COMMAND" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*[rRfF][a-zA-Z]*[[:space:]]+)+(/|~|\$HOME|/Users)([[:space:]]|/|"|$)'; then
    emit deny "Blocked: rm -rf targeting filesystem root, home directory, or /Users. $BYPASS_HINT"
fi

# Explicit catch for rm -rf / regardless of flag clustering.
if printf '%s' "$COMMAND" | grep -qE 'rm[[:space:]]+.*-[rRfF][a-zA-Z]*[[:space:]]+/([[:space:]]|$)'; then
    emit deny "Blocked: rm -rf /. $BYPASS_HINT"
fi

# dd writing to a raw disk device. dd if=... alone (input flag) is benign — only
# block when of= targets a raw device.
if printf '%s' "$COMMAND" | grep -qE 'dd[[:space:]]+.*of=/dev/(disk|sd|nvme|rdisk)'; then
    emit deny "Blocked: dd writing to a raw disk device — this overwrites the device. $BYPASS_HINT"
fi

# mkfs against a raw disk device. The (.*[[:space:]])? group is OPTIONAL so the
# canonical two-token form `mkfs.ext4 /dev/disk2` matches as well as the
# three-token form `mkfs.ext4 -F /dev/disk2`. The earlier regex required an
# extra whitespace-separated token between mkfs.* and /dev/, silently allowing
# the most common honest-mistake form — see SPECIFICATIONS/ARCHIVE/pretooluse-
# safety-harness.md § Implementation findings (post-merge fixes).
if printf '%s' "$COMMAND" | grep -qE 'mkfs(\.[a-z0-9]+)?[[:space:]]+(.*[[:space:]])?/dev/(disk|sd|nvme|rdisk)'; then
    emit deny "Blocked: mkfs formatting a raw disk device. $BYPASS_HINT"
fi

# diskutil eraseDisk.
if printf '%s' "$COMMAND" | grep -qE 'diskutil[[:space:]]+eraseDisk'; then
    emit deny "Blocked: diskutil eraseDisk. $BYPASS_HINT"
fi

# SQL DROP TABLE/DATABASE/SCHEMA. Case-insensitive. Catches direct execution via
# psql -c, supabase db execute, etc. Editing migration files (Write/Edit) is not
# caught — only command-line execution.
if printf '%s' "$COMMAND" | grep -qiE '\bDROP[[:space:]]+(TABLE|DATABASE|SCHEMA)\b'; then
    emit deny "Blocked: SQL DROP TABLE/DATABASE/SCHEMA on the command line. Schema changes should go through a migration file. $BYPASS_HINT"
fi

# gh repo delete.
if printf '%s' "$COMMAND" | grep -qE 'gh[[:space:]]+repo[[:space:]]+delete\b'; then
    emit deny "Blocked: gh repo delete. $BYPASS_HINT"
fi

# === ASK TIER ===

# git reset --hard. Pattern-only — no rev-list lookup, the user disambiguates.
if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+reset[[:space:]]+(--hard|.*[[:space:]]--hard)'; then
    emit ask "git reset --hard discards all uncommitted changes and any commits ahead of the target. Continue?"
fi

# git push --force (or -f) to a non-main/master branch. Force-push to main is
# explicitly NOT caught here — branch protection on the remote is the right
# layer for that, and the explicit rule in .claude/CLAUDE.md covers the local
# convention.
if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]]+.*(-f\b|--force\b)'; then
    # Anchor the main/master exclusion at end-of-arg ([[:space:]]|$). \b alone
    # treats the dash in master-prod / main-old as a word boundary, so those
    # branch names slipped the exclusion → no ask prompt fired. They are NOT
    # the design's "literally main/master" case (which is excluded because
    # branch protection covers it remotely).
    if ! printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]]+.*[[:space:]](main|master)([[:space:]]|$)'; then
        emit ask "git push --force rewrites branch history. Continue if this is your personal branch and you intended to rebase."
    fi
fi

# chmod 777 (and -R 777). Originally drafted at warn tier (educational
# systemMessage) but moved to ask tier during implementation when systemMessage
# was found not to render in interactive Claude Code. Ask-tier confirmation
# preserves the educational signal in a form that actually reaches the user.
if printf '%s' "$COMMAND" | grep -qE 'chmod[[:space:]]+(-R[[:space:]]+)?0?777\b'; then
    emit ask "chmod 777 grants read/write/execute to everyone including other users on the system. Usually chmod 750 (owner+group full, others nothing) or chmod 755 (owner full, others read+execute) is what's wanted. Continue with 777?"
fi

# Default: allow silently.
exit 0
