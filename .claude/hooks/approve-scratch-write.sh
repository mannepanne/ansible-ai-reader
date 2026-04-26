#!/bin/bash
# ABOUT: PreToolUse hook — auto-approve Write tool calls into <project>/SCRATCH/.
# ABOUT: Workaround for the documented Write allowlist not silencing prompts.
#
# Decision rationale: REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md
# Operations / extension / removal: REFERENCE/scratch-write-hook.md
# Diagnosis trail: SPECIFICATIONS/ARCHIVE/INVESTIGATION-claude-code-write-path-normalisation.md
#
# Scope: only Write tool calls, only paths textually under $CLAUDE_PROJECT_DIR/SCRATCH/.
# Anything else falls through unchanged. Path matching is textual prefix, not
# realpath — symlinks inside SCRATCH/ that point outside the project will be
# approved. Out-of-scope per the threat-model ADR; see REFERENCE/scratch-write-hook.md.
#
# Bypass: this hook only emits "allow" — it cannot block anything. There is
# no SAFETY_HARNESS_OFF style escape because there is nothing destructive to
# escape from.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/parse-tool-input.sh"

INPUT=$(cat)
parse_tool_input "$INPUT" "file_path"
FILE_PATH="$TOOL_INPUT_VALUE"

# Only operate on Write. Hook is registered with matcher "Write" but if the
# matcher behaviour ever changes, fail safe by exiting silently for other tools.
if [ "${TOOL_NAME:-}" != "Write" ]; then
    exit 0
fi

# Must have a project root to compare against. If CLAUDE_PROJECT_DIR is unset
# (which would be unusual — Claude Code always exports it), fall through to
# default behaviour rather than risk approving writes outside the project.
if [ -z "${CLAUDE_PROJECT_DIR:-}" ]; then
    exit 0
fi

SCRATCH_DIR="$CLAUDE_PROJECT_DIR/SCRATCH"

# Reject any path containing `..` segments. The case pattern below would
# otherwise match traversal forms like "$SCRATCH_DIR/../etc/passwd" because
# the prefix string still equals "$SCRATCH_DIR/". Legitimate Writes inside
# SCRATCH never contain `..`, so this is safe to reject outright.
case "$FILE_PATH" in
    *..*)
        exit 0
        ;;
esac

# Approve only if file_path is strictly inside $CLAUDE_PROJECT_DIR/SCRATCH/.
# The trailing /* in the case pattern enforces "must have at least one segment
# after SCRATCH/", so the hook never approves writes to the SCRATCH directory
# entry itself or to a sibling like SCRATCHPAD.
case "$FILE_PATH" in
    "$SCRATCH_DIR"/*)
        python3 -c "
import json
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'permissionDecision': 'allow',
        'permissionDecisionReason': 'Auto-approved: Write into project SCRATCH directory. See REFERENCE/decisions/2026-04-26-scratch-write-pretooluse-hook.md for why the hook is needed instead of an allow-list entry.'
    }
}))
"
        exit 0
        ;;
esac

# Not a SCRATCH write — let default behaviour proceed.
exit 0
