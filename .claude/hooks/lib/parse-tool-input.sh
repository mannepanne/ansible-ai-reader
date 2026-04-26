# ABOUT: Shared parser for PreToolUse hook scripts. Sourced, not executed.
# ABOUT: Reads a JSON document and exposes TOOL_NAME plus a named field's value.
#
# Why this lives in lib/ rather than each hook: both safety-harness.sh and
# approve-scratch-write.sh need to extract `tool_name` plus one field from the
# nested `tool_input` object, with the same base64 round-trip to keep exotic
# bytes (newlines, shell metacharacters, embedded quotes) out of shell word-
# splitting. Diverging copies would drift; one copy in lib/ keeps the contract
# coherent across hooks.
#
# Usage (sourced by a hook script):
#
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   . "$SCRIPT_DIR/lib/parse-tool-input.sh"
#
#   INPUT=$(cat)
#   parse_tool_input "$INPUT" "command"      # Bash hooks
#   # or:
#   parse_tool_input "$INPUT" "file_path"    # Write hooks
#
#   echo "tool: $TOOL_NAME"
#   echo "value: $TOOL_INPUT_VALUE"
#
# After parse_tool_input returns:
# - TOOL_NAME holds the top-level "tool_name" string (empty on parse failure)
# - TOOL_INPUT_VALUE holds the named field from "tool_input" (empty on parse
#   failure or missing field)
#
# Failure modes are deliberately quiet: if python3 errors, JSON is malformed,
# or the field is missing, both variables are set to the empty string. Callers
# treat empty values as "no signal" and fall through to default behaviour. This
# matches the existing fail-closed (for safety-harness) / fail-passthrough (for
# approve-scratch-write) shape that both hooks already had.
#
# Field name is passed via python's argv (sys.argv[1]) rather than embedded
# in the inline script body — keeps shell substitution out of the python source
# and removes one class of injection vector if a future caller ever passes an
# untrusted field name.

parse_tool_input() {
    local input="$1"
    local field="$2"
    local b64

    read -r TOOL_NAME b64 <<< "$(printf '%s' "$input" | python3 -c "
import sys, json, base64
try:
    data = json.loads(sys.stdin.read())
    name = data.get('tool_name', '')
    val = data.get('tool_input', {}).get(sys.argv[1], '')
    val_b64 = base64.b64encode(val.encode('utf-8')).decode('ascii')
    print(name, val_b64)
except Exception:
    print('', '')
" "$field" 2>/dev/null)"

    if [ -n "${b64:-}" ]; then
        TOOL_INPUT_VALUE=$(printf '%s' "$b64" | base64 --decode 2>/dev/null)
    else
        TOOL_INPUT_VALUE=""
    fi
}
