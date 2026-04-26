#!/bin/bash
# ABOUT: Fixture-based test runner for the safety-harness PreToolUse hook.
# ABOUT: Pipes each *.in.json through the hook and diffs against *.expected.json.
#
# Usage: .claude/hooks/tests/safety-harness/run-tests.sh
# Returns: exit 0 on all-pass, exit 1 on any failure (with diff output).

set -u

# Unset any inherited bypass so the suite tests the hook's actual behaviour, not
# the bypassed pass-through. A developer running the suite from a shell where
# SAFETY_HARNESS_OFF=1 is exported would otherwise see all-pass while the
# harness is fully off.
unset SAFETY_HARNESS_OFF

# Resolve paths relative to this script so the runner works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/../../safety-harness.sh"
FIXTURES="$SCRIPT_DIR/fixtures"

if [ ! -x "$HOOK" ]; then
    echo "FAIL: hook script not found or not executable at $HOOK" >&2
    exit 1
fi

if [ ! -d "$FIXTURES" ]; then
    echo "FAIL: fixtures directory not found at $FIXTURES" >&2
    exit 1
fi

PASS=0
FAIL=0
FAILURES=()

# Test 0: fixture-naming convention check. block-* and ask-* fixtures must have
# non-empty .expected.json (the hook must produce a deny/ask JSON for them).
# allow-* and bypass-* fixtures must have empty .expected.json (the hook must
# produce no output, defaulting to allow). Mismatch usually means a regex
# silently failed but the empty expected file masked the bug.
for in_file in "$FIXTURES"/*.in.json; do
    [ -f "$in_file" ] || continue
    name=$(basename "$in_file" .in.json)
    expected_file="$FIXTURES/$name.expected.json"
    [ -f "$expected_file" ] || continue
    case "$name" in
        block-*|ask-*)
            if [ ! -s "$expected_file" ]; then
                echo "FAIL: fixture-naming check — $name implies block/ask but $name.expected.json is empty" >&2
                echo "      An empty expected file says 'hook should output nothing' which contradicts the block/ask intent." >&2
                FAIL=$((FAIL + 1))
                FAILURES+=("naming:$name")
            fi
            ;;
        allow-*|bypass-*)
            if [ -s "$expected_file" ]; then
                echo "FAIL: fixture-naming check — $name implies allow/bypass but $name.expected.json is non-empty" >&2
                echo "      A non-empty expected file says the hook should produce JSON, contradicting the allow/bypass intent." >&2
                FAIL=$((FAIL + 1))
                FAILURES+=("naming:$name")
            fi
            ;;
    esac
done

# Test 1: pattern fixtures (each *.in.json paired with *.expected.json).
for in_file in "$FIXTURES"/*.in.json; do
    [ -f "$in_file" ] || continue
    name=$(basename "$in_file" .in.json)
    expected_file="$FIXTURES/$name.expected.json"

    if [ ! -f "$expected_file" ]; then
        echo "FAIL: $name — no matching .expected.json" >&2
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        continue
    fi

    actual=$("$HOOK" < "$in_file" 2>/dev/null)
    expected=$(cat "$expected_file")

    if [ "$actual" = "$expected" ]; then
        PASS=$((PASS + 1))
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        echo "FAIL: $name" >&2
        echo "  expected: $expected" >&2
        echo "  actual:   $actual" >&2
    fi
done

# Test 2: env-var bypass. Run a known-block command with SAFETY_HARNESS_OFF=1
# and assert the script exits 0 with no JSON output (plus the stderr signal).
bypass_input='{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'
bypass_actual=$(SAFETY_HARNESS_OFF=1 "$HOOK" <<< "$bypass_input" 2>/dev/null)
bypass_stderr=$(SAFETY_HARNESS_OFF=1 "$HOOK" <<< "$bypass_input" 2>&1 >/dev/null)

if [ -z "$bypass_actual" ] && echo "$bypass_stderr" | grep -q "disabled via SAFETY_HARNESS_OFF"; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
    FAILURES+=("env-var bypass")
    echo "FAIL: env-var bypass" >&2
    echo "  expected stdout: (empty)" >&2
    echo "  actual stdout:   $bypass_actual" >&2
    echo "  expected stderr: contains 'disabled via SAFETY_HARNESS_OFF'" >&2
    echo "  actual stderr:   $bypass_stderr" >&2
fi

# Summary.
TOTAL=$((PASS + FAIL))
echo ""
echo "Tests: $PASS/$TOTAL passing"
if [ "$FAIL" -gt 0 ]; then
    echo "Failed: ${FAILURES[*]}" >&2
    exit 1
fi
exit 0
