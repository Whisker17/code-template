#!/usr/bin/env bash
# Dispatch a prompt to a named agent role, in a fresh context, from any runtime.
#
# This is the portability seam. Skills name a ROLE (REVIEWER, ESCALATOR,
# EXPLORER) and never a model; the role → command mapping lives in one place
# (config/agent-roles.conf) so a model generation change is a one-line edit.
#
# A runtime with its own fresh-context sub-agent primitive (e.g. Claude Code's
# Agent tool) may use that instead, provided it honours the role's _MODEL. This
# script is the fallback that works everywhere, including runtimes with no
# sub-agent primitive at all -- and it is the canonical definition of what a
# role dispatch means.
#
# Usage:
#   scripts/agent-dispatch.sh REVIEWER prompt.txt      # prompt from a file
#   echo "..." | scripts/agent-dispatch.sh REVIEWER -  # prompt from stdin
#   scripts/agent-dispatch.sh --probe                  # check every role
#   scripts/agent-dispatch.sh --probe REVIEWER         # check one role
#
# Runtime selection is automatic. Override it explicitly when needed:
#   AGENT_RUNTIME=codex scripts/agent-dispatch.sh --probe
#   AGENT_RUNTIME=claude-code scripts/agent-dispatch.sh --probe
#   AGENT_RUNTIME=grok scripts/agent-dispatch.sh --probe
#
# Exit codes:
#   0  success
#   2  usage error
#   3  ROLE UNAVAILABLE -- not configured, or its binary is missing. This is a
#      hard stop, never a licence to self-review: see docs/agents/runtime.md
#      § Degraded mode.
#   *  otherwise the dispatched command's own exit code

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${AGENT_ROLES_CONF:-$REPO_ROOT/config/agent-roles.conf}"
ROLES="REVIEWER ESCALATOR EXPLORER"

die() { echo "agent-dispatch: $*" >&2; exit 2; }

if [ ! -f "$CONF" ]; then
    die "no role mapping at $CONF (see docs/agents/runtime.md)"
fi
# shellcheck disable=SC1090
. "$CONF"

# Resolve the current host before looking up any role. Ambiguity is an error:
# silently choosing one vendor would make the review policy depend on PATH order.
has_env() {
    local name
    for name in "$@"; do
        if [ -n "${!name:-}" ]; then
            return 0
        fi
    done
    return 1
}

# Grok does not currently publish a stable runtime environment variable to the
# shell used by its Bash tool. Walk the process ancestry as a fallback signal.
# An explicit AGENT_RUNTIME always takes precedence over this detection.
has_ancestor_process() {
    local pid="${PPID:-}" name parent
    while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
        name="$(ps -p "$pid" -o comm= 2>/dev/null | tr -d '[:space:]')"
        case "$name" in
            grok|grok-*) return 0 ;;
        esac
        parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d '[:space:]')"
        [ -n "$parent" ] || break
        [ "$parent" != "$pid" ] || break
        pid="$parent"
    done
    return 1
}

if [ -n "${AGENT_RUNTIME:-}" ]; then
    case "$AGENT_RUNTIME" in
        codex|codex-app|codex-cli) RUNTIME="codex" ;;
        claude|claude-code) RUNTIME="claude-code" ;;
        grok) RUNTIME="grok" ;;
        *) die "unknown AGENT_RUNTIME '$AGENT_RUNTIME' (expected codex, claude-code, or grok)" ;;
    esac
else
    codex_detected=0
    claude_detected=0
    grok_detected=0
    has_env CODEX_SHELL CODEX_CI CODEX_THREAD_ID CODEX_INTERNAL_ORIGINATOR_OVERRIDE && codex_detected=1
    has_env CLAUDECODE CLAUDE_CODE CLAUDE_CODE_ENTRYPOINT && claude_detected=1
    if has_env GROK_CLI GROK_RUNTIME GROK_SESSION_ID || has_ancestor_process; then
        grok_detected=1
    fi

    detected_count=$((codex_detected + claude_detected + grok_detected))
    if [ "$detected_count" -gt 1 ]; then
        die "runtime is ambiguous; set AGENT_RUNTIME=codex, claude-code, or grok"
    elif [ "$codex_detected" -eq 1 ]; then
        RUNTIME="codex"
    elif [ "$claude_detected" -eq 1 ]; then
        RUNTIME="claude-code"
    elif [ "$grok_detected" -eq 1 ]; then
        RUNTIME="grok"
    else
        die "runtime is unknown; set AGENT_RUNTIME=codex, claude-code, or grok"
    fi
fi

case "$RUNTIME" in
    codex) RUNTIME_PREFIX="CODEX" ;;
    claude-code) RUNTIME_PREFIX="CLAUDE_CODE" ;;
    grok) RUNTIME_PREFIX="GROK" ;;
esac

config_value() {
    local key="$1"
    eval "printf '%s' \"\${${RUNTIME_PREFIX}_${key}:-}\""
}

# Resolve a role to its command, or fail with code 3.
resolve() {
    local role="$1" cmd
    cmd="$(config_value "${role}_CMD")"
    if [ -z "$cmd" ]; then
        cat >&2 <<MSG
agent-dispatch: role $role is not configured.

  ${RUNTIME_PREFIX}_${role}_CMD is unset in $CONF.
  Fill it in for runtime '$RUNTIME', then re-run: scripts/agent-dispatch.sh --probe $role
MSG
        return 3
    fi
    # First word of _CMD is the binary.
    local bin="${cmd%% *}"
    if ! command -v "$bin" >/dev/null 2>&1; then
        cat >&2 <<MSG
agent-dispatch: role $role is configured but unreachable.

  ${RUNTIME_PREFIX}_${role}_CMD = $cmd
  '$bin' is not on PATH. Install or authenticate it, or point $role at a
  runtime '$RUNTIME' (config/agent-roles.conf).
MSG
        return 3
    fi
    printf '%s' "$cmd"
}

# --- probe mode --------------------------------------------------------------
if [ "${1:-}" = "--probe" ]; then
    shift
    targets="${*:-$ROLES}"
    failed=0
    for role in $targets; do
        if cmd="$(resolve "$role" 2>/dev/null)"; then
            echo "ok        $role -> $cmd"
        else
            echo "UNUSABLE  $role"
            failed=1
        fi
    done
    echo "runtime: $RUNTIME"
    impl="$(config_value IMPLEMENTER_LABEL)"
    echo "implementer: $impl"
    effort="$(config_value IMPLEMENTER_EFFORT)"
    [ -n "$effort" ] && echo "implementer-effort: $effort"
    if [ "$failed" -eq 1 ]; then
        echo "" >&2
        echo "One or more roles are unusable. Work that needs them must stop at" >&2
        echo "In Review for a human -- see docs/agents/runtime.md § Degraded mode." >&2
        exit 3
    fi
    exit 0
fi

# --- dispatch mode -----------------------------------------------------------
[ "$#" -ge 2 ] || die "usage: agent-dispatch.sh <ROLE> <prompt-file|-> | --probe [ROLE]"

ROLE="$1"; PROMPT_SRC="$2"; shift 2

case " $ROLES " in
    *" $ROLE "*) ;;
    *) die "unknown role '$ROLE' (known: $ROLES, and IMPLEMENTER which is never dispatched)" ;;
esac

if [ "$PROMPT_SRC" != "-" ] && [ ! -f "$PROMPT_SRC" ]; then
    die "prompt file not found: $PROMPT_SRC"
fi

CMD="$(resolve "$ROLE")" || exit 3

# Word-split _CMD deliberately: it is an operator-supplied command line.
# shellcheck disable=SC2086
if [ "$PROMPT_SRC" = "-" ]; then
    exec $CMD "$@"
else
    exec $CMD "$@" < "$PROMPT_SRC"
fi
