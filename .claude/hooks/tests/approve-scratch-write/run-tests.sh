#!/bin/bash
# ABOUT: Fixture-based test runner for the approve-scratch-write PreToolUse hook.
# ABOUT: Pipes each *.in.json through the hook and diffs against *.expected.json.
#
# Usage: .claude/hooks/tests/approve-scratch-write/run-tests.sh
# Returns: exit 0 on all-pass, exit 1 on any failure (with diff output).
#
# Pattern mirrors safety-harness/run-tests.sh. CLAUDE_PROJECT_DIR is forced to
# a fixed value so tests are reproducible regardless of where they run from.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/../../approve-scratch-write.sh"
FIXTURES="$SCRIPT_DIR/fixtures"

if [ ! -x "$HOOK" ]; then
    echo "FAIL: hook script not found or not executable at $HOOK" >&2
    exit 1
fi

if [ ! -d "$FIXTURES" ]; then
    echo "FAIL: fixtures directory not found at $FIXTURES" >&2
    exit 1
fi

# Pin CLAUDE_PROJECT_DIR so fixtures can hard-code paths under it. Fixtures
# reference /tmp/test-project/SCRATCH/... — picked because /tmp is universally
# writable and the path is obviously synthetic.
export CLAUDE_PROJECT_DIR="/tmp/test-project"

PASS=0
FAIL=0
FAILURES=()

# Fixture-naming convention: approve-* fixtures must have non-empty expected
# JSON (the hook must emit an allow decision). passthrough-* fixtures must
# have empty expected (no output, default behaviour).
for in_file in "$FIXTURES"/*.in.json; do
    [ -f "$in_file" ] || continue
    name=$(basename "$in_file" .in.json)
    expected_file="$FIXTURES/$name.expected.json"
    [ -f "$expected_file" ] || continue
    case "$name" in
        approve-*)
            if [ ! -s "$expected_file" ]; then
                echo "FAIL: fixture-naming check — $name implies approve but $name.expected.json is empty" >&2
                FAIL=$((FAIL + 1))
                FAILURES+=("naming:$name")
            fi
            ;;
        passthrough-*)
            if [ -s "$expected_file" ]; then
                echo "FAIL: fixture-naming check — $name implies passthrough but $name.expected.json is non-empty" >&2
                FAIL=$((FAIL + 1))
                FAILURES+=("naming:$name")
            fi
            ;;
    esac
done

# Pattern fixtures.
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

# Unset-CLAUDE_PROJECT_DIR safety check: hook must fall through silently if
# the env var is missing. Using a SCRATCH-shaped path proves the env-var guard
# (not the path check) is what suppresses the approval.
unset_input='{"tool_name":"Write","tool_input":{"file_path":"/tmp/test-project/SCRATCH/foo.md"}}'
unset_actual=$(env -u CLAUDE_PROJECT_DIR "$HOOK" <<< "$unset_input" 2>/dev/null)
if [ -z "$unset_actual" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
    FAILURES+=("unset-env-passthrough")
    echo "FAIL: unset-env-passthrough" >&2
    echo "  expected stdout: (empty)" >&2
    echo "  actual stdout:   $unset_actual" >&2
fi

TOTAL=$((PASS + FAIL))
echo ""
echo "Tests: $PASS/$TOTAL passing"
if [ "$FAIL" -gt 0 ]; then
    echo "Failed: ${FAILURES[*]}" >&2
    exit 1
fi
exit 0
