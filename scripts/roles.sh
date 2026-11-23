#!/usr/bin/env bash
# Read, verify and change the role bindings: which runtime, model and effort a role uses.
#
# Usage:
#   scripts/roles.sh list
#   scripts/roles.sh check [ROLE ...]
#   scripts/roles.sh get ROLE [--effort medium|high]
#   scripts/roles.sh set ROLE [--runtime R] [--model M] [--effort E | --effort-medium E --effort-high E] --reason "why"
#
# Code roles (ORCHESTRATOR IMPLEMENTER REVIEWER REVIEWER_FALLBACK) live in config/agent-roles.conf
# and have two efforts (medium, high). Content roles (DECK_WRITER, DECK_REVIEWER, ...: every
# `<ROLE>_RUNTIME` key of the optional config/content-roles.conf) have one `<ROLE>_EFFORT`. An
# absent content file is skipped silently. Contract: docs/agents/runtime.md.
#
# The files are read from the PRIMARY clone (the first entry of `git worktree list`, located from
# this script's own repo), exactly like scripts/agent-dispatch.sh, so every worktree sees a binding
# change at once. They are parsed, never sourced: only exact `KEY="value"` lines count.
#
# `check` never invokes a model: it asks `pi --list-models` (the only call it makes) and, for
# claude and codex, which cannot list models, warns that the model is not verified.
#
# `set` is the role-binding lane (docs/GIT_WORKFLOW.md § Role binding lane): it validates the whole
# candidate tuple with `check`, rewrites only the targeted lines, makes ONE commit and pushes it to
# the trunk, where .githooks/pre-push admits it. It refuses, changing nothing, unless it runs in
# the primary clone on the trunk, with an empty index, no merge, cherry-pick, revert or rebase in
# progress, no unstaged edit in the target conf and HEAD equal to the remote trunk. If the commit or
# push fails, or SIGINT/SIGTERM arrives after the edit, it rolls back (never `reset --hard`).
#
# Exit codes: 0 ok; 1 a check failed or `set` refused; 2 usage error; 3 `get`: role unavailable.

set -euo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODE_ROLES="ORCHESTRATOR IMPLEMENTER REVIEWER REVIEWER_FALLBACK"
RUNTIMES="claude codex pi"
USAGE="usage: roles.sh list | check [ROLE ...] | get ROLE [--effort medium|high] | set ROLE [--runtime R] [--model M] [--effort E | --effort-medium E --effort-high E] --reason TEXT"

usage() { echo "roles: $*" >&2; exit 2; }

# --- where the files are (same logic as scripts/agent-dispatch.sh) -------------------------------

# Prints the primary clone's path, or nothing without git, outside a work tree or when this
# script's repo is not a repository root.
primary_root() {
    command -v git >/dev/null 2>&1 || return 0
    local top list first
    top="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null)" || return 0
    [ "$(cd "$top" && pwd -P)" = "$(cd "$REPO_ROOT" && pwd -P)" ] || return 0
    list="$(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null)" || return 0
    first="${list%%$'\n'*}"
    [ "${first#worktree }" != "$first" ] || return 0
    printf '%s' "${first#worktree }"
}
PRIMARY="$(primary_root)"

# Both files come from one place: the primary clone when it has the role mapping, else this repo. A
# worktree's own copy of an optional file the primary deleted is never read.
CONF_DIR="$REPO_ROOT/config"
[ -z "$PRIMARY" ] || [ ! -f "$PRIMARY/config/agent-roles.conf" ] || CONF_DIR="$PRIMARY/config"
conf_path() { if [ -f "$CONF_DIR/$1" ]; then printf '%s' "$CONF_DIR/$1"; fi; }
AGENT_CONF="$(conf_path agent-roles.conf)"
CONTENT_CONF="$(conf_path content-roles.conf)"
[ -n "$AGENT_CONF" ] || usage "no role mapping: config/agent-roles.conf not found (see docs/agents/runtime.md)"

# --- reading the files ---------------------------------------------------------------------------

# $1 file, $2 key: prints "<count>\t<last value>" over the lines that are exactly KEY="value"
# (no quote inside the value). Anything else, a comment or a differently quoted line, is ignored.
conf_scan() {
    awk -v k="$2" '
        BEGIN { p = k "=\"" }
        {
            if (substr($0, 1, length(p)) != p) next
            r = substr($0, length(p) + 1)
            if (substr(r, length(r)) != "\"") next
            r = substr(r, 1, length(r) - 1)
            if (index(r, "\"")) next
            n++; v = r
        }
        END { printf "%d\t%s", n, v }' "$1"
}
conf_get() { local s; s="$(conf_scan "$1" "$2")"; printf '%s' "${s#*$'\t'}"; }
conf_count() { local s; s="$(conf_scan "$1" "$2")"; printf '%s' "${s%%$'\t'*}"; }

# in_words LIST WORD: exact membership of one whole word; an empty WORD is never a member (a
# substring match would accept a multi-word value such as "low medium").
in_words() {
    local w
    [ -n "$2" ] || return 1
    for w in $1; do [ "$w" = "$2" ] && return 0; done
    return 1
}

# Content roles: every <ROLE>_RUNTIME key of the content file that is not a code role.
content_roles() {
    [ -n "$CONTENT_CONF" ] || return 0
    local role
    LC_ALL=C awk -F= '/^[A-Z][A-Z0-9_]*_RUNTIME="/ { k = $1; sub(/_RUNTIME$/, "", k); if (!seen[k]++) print k }' "$CONTENT_CONF" |
        while IFS= read -r role; do
            in_words "$CODE_ROLES" "$role" || echo "$role"
        done
}

# Prints code | content; returns 1 for an unknown role.
role_kind() {
    if in_words "$CODE_ROLES" "$1"; then echo code; return 0; fi
    if in_words "$(content_roles | tr '\n' ' ')" "$1"; then echo content; return 0; fi
    return 1
}
role_file() { if [ "$(role_kind "$1")" = code ]; then printf '%s' "$AGENT_CONF"; else printf '%s' "$CONTENT_CONF"; fi; }
role_rel() { if [ "$(role_kind "$1")" = code ]; then printf 'config/agent-roles.conf'; else printf 'config/content-roles.conf'; fi; }
rget() { conf_get "$(role_file "$1")" "$1_$2"; }

efforts_of() {
    case "$1" in
        pi) echo "off minimal low medium high xhigh max" ;;
        claude) echo "low medium high xhigh max" ;;
        codex) echo "minimal low medium high xhigh" ;;
    esac
}
is_runtime() { in_words "$RUNTIMES" "$1"; }

# One plain token, as scripts/agent-dispatch.sh requires: no whitespace, quote or leading dash.
plain() { case "$1" in -*|*[!A-Za-z0-9._/:@+=-]*) return 1 ;; esac; }

# --- the check -----------------------------------------------------------------------------------

PI_STATE=""; PI_LIST=""
# $1 model. 0 listed, 1 not listed, 2 `pi --list-models` failed. The first line is the header;
# the model is column 2 exactly or `<column 1>/<column 2>` exactly.
pi_listed() {
    if [ -z "$PI_STATE" ]; then
        if PI_LIST="$(pi --list-models </dev/null 2>/dev/null)"; then PI_STATE=ok; else PI_STATE=fail; fi
    fi
    [ "$PI_STATE" = ok ] || return 2
    printf '%s\n' "$PI_LIST" |
        awk -v m="$1" 'NR > 1 && ($2 == m || ($1 "/" $2) == m) { f = 1 } END { exit !f }'
}

PROBLEMS=""; WARNS=""
problem() { PROBLEMS="${PROBLEMS:+$PROBLEMS; }$1"; }
warn() { WARNS="${WARNS:+$WARNS; }$1"; }

# tuple_check RUNTIME MODEL EFFORT...: sets PROBLEMS and WARNS (empty = none); returns 1 on a problem.
tuple_check() {
    local runtime="$1" model="$2" e valid="" rc any=0
    shift 2
    PROBLEMS=""; WARNS=""
    if [ -z "$runtime" ]; then
        problem "runtime is unset"
    elif ! is_runtime "$runtime"; then
        problem "unknown runtime '$runtime' (known: $RUNTIMES)"
    else
        command -v "$runtime" >/dev/null 2>&1 || problem "'$runtime' is not on PATH"
        valid="$(efforts_of "$runtime")"
    fi
    if [ -z "$model" ]; then
        problem "model is unset"
    elif ! plain "$model"; then
        problem "model '$model' must be a single plain token"
    elif [ "$runtime" = pi ] && [ "${model#*:}" != "$model" ]; then
        problem "pi model '$model' embeds a thinking level; use the effort key"
    elif [ "$runtime" = pi ]; then
        if command -v pi >/dev/null 2>&1; then
            rc=0; pi_listed "$model" || rc=$?
            case "$rc" in
                0) ;;
                1) problem "model '$model' is not listed by 'pi --list-models'" ;;
                *) problem "'pi --list-models' failed" ;;
            esac
        fi
    elif [ -n "$valid" ]; then
        warn "$runtime cannot list models; model '$model' is not verified"
    fi
    for e in "$@"; do
        [ -n "$e" ] || continue
        any=1
        if [ -n "$valid" ]; then
            in_words "$valid" "$e" || problem "effort '$e' is not valid for $runtime (valid: $valid)"
        fi
    done
    [ "$any" -eq 1 ] || problem "no effort is set"
    [ -z "$PROBLEMS" ]
}

# The tuple a role would have: prints "runtime|model|effort1|effort2" fields via globals.
load_role() {
    R_RUNTIME="$(rget "$1" RUNTIME)"; R_MODEL="$(rget "$1" MODEL)"
    if [ "$(role_kind "$1")" = code ]; then
        R_E1="$(rget "$1" EFFORT_MEDIUM)"; R_E2="$(rget "$1" EFFORT_HIGH)"
    else
        R_E1="$(rget "$1" EFFORT)"; R_E2=""
    fi
}

check_role() {
    local role="$1" legacy w
    load_role "$role"
    if [ "$role" = REVIEWER_FALLBACK ] && [ -z "$R_RUNTIME$R_MODEL$R_E1$R_E2" ]; then
        echo "unset     $role -- optional, not declared"
        return 0
    fi
    tuple_check "$R_RUNTIME" "$R_MODEL" "$R_E1" "$R_E2" || true
    if [ "$(role_kind "$role")" = code ]; then
        for legacy in "${role}_EXTRA_ARGS" "${role}_CMD"; do
            [ -z "$(conf_get "$AGENT_CONF" "$legacy")" ] || problem "$legacy is not supported (agent-dispatch.sh refuses it)"
        done
    fi
    [ -z "$WARNS" ] || echo "warn      $role -- $WARNS"
    if [ -n "$PROBLEMS" ]; then
        echo "UNUSABLE  $role -- $PROBLEMS"
        return 1
    fi
    w="$R_E1${R_E1:+${R_E2:+ }}$R_E2"
    echo "ok        $role -> $R_RUNTIME $R_MODEL (effort: $w)"
}

all_roles() { echo "$CODE_ROLES $(content_roles | tr '\n' ' ')"; }

cmd_check() {
    local role roles failed=0
    roles="${*:-$(all_roles)}"
    for role in $roles; do role_kind "$role" >/dev/null || usage "unknown role '$role' (known: $(all_roles))"; done
    for role in $roles; do check_role "$role" || failed=1; done
    [ "$failed" -eq 0 ] || exit 1
}

cmd_list() {
    local role
    echo "Code roles ($AGENT_CONF)"
    printf '%-20s %-8s %-36s %-8s %s\n' ROLE RUNTIME MODEL MEDIUM HIGH
    for role in $CODE_ROLES; do
        load_role "$role"
        printf '%-20s %-8s %-36s %-8s %s\n' "$role" "${R_RUNTIME:--}" "${R_MODEL:--}" "${R_E1:--}" "${R_E2:--}"
    done
    [ -n "$(content_roles)" ] || return 0
    echo
    echo "Content roles ($CONTENT_CONF)"
    printf '%-20s %-8s %-36s %s\n' ROLE RUNTIME MODEL EFFORT
    for role in $(content_roles); do
        load_role "$role"
        printf '%-20s %-8s %-36s %s\n' "$role" "${R_RUNTIME:--}" "${R_MODEL:--}" "${R_E1:--}"
    done
}

# --- get -----------------------------------------------------------------------------------------

cmd_get() {
    [ "$#" -ge 1 ] || usage "$USAGE"
    local role="$1" effort="" kind why=""
    shift
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --effort) [ "$#" -ge 2 ] || usage "--effort needs a value"; effort="$2"; shift 2 ;;
            *) usage "unexpected argument '$1'" ;;
        esac
    done
    kind="$(role_kind "$role")" || usage "unknown role '$role' (known: $(all_roles))"
    if [ "$kind" = code ]; then
        case "$effort" in medium|high) ;; *) usage "$role needs --effort medium|high" ;; esac
    else
        [ -z "$effort" ] || usage "$role is a content role: it has its own effort, drop --effort"
    fi
    load_role "$role"
    if [ "$kind" = code ]; then
        if [ "$effort" = medium ]; then R_E=$R_E1; else R_E=$R_E2; fi
    else
        R_E=$R_E1
    fi
    if ! is_runtime "$R_RUNTIME"; then why="runtime '$R_RUNTIME' is not one of: $RUNTIMES"
    elif [ -z "$R_MODEL" ] || ! plain "$R_MODEL"; then why="model '$R_MODEL' is unset or not a single plain token"
    elif [ "$R_RUNTIME" = pi ] && [ "${R_MODEL#*:}" != "$R_MODEL" ]; then why="pi model '$R_MODEL' embeds a thinking level"
    elif ! in_words "$(efforts_of "$R_RUNTIME")" "$R_E"; then why="effort '$R_E' is unset or not valid for $R_RUNTIME"
    fi
    if [ -n "$why" ]; then echo "roles: $role unavailable: $why" >&2; exit 3; fi
    if [ "$R_RUNTIME" = pi ]; then echo "$R_MODEL:$R_E"; else echo "$R_RUNTIME $R_MODEL $R_E"; fi
}

# --- set -----------------------------------------------------------------------------------------

refuse() { echo "roles: set refused: $*" >&2; exit 1; }
shown() { if [ -n "$1" ]; then printf '%s' "$1"; else printf '""'; fi; }
KEYS=(); OLDS=(); NEWS=()
NEED_ROLLBACK=0
G() { git -C "$REPO_ROOT" "$@"; }

# One refusal for every character that could break the KEY="value" line, a shell word or the hook.
safe_value() {
    case "$2" in
        *'$'*|*'`'*|*'\'*|*'"'*|*[[:space:]]*)
            refuse "$1 value '$2' has a forbidden character (\$, backtick, backslash, double quote, whitespace)" ;;
    esac
}

cmd_set() {
    [ "$#" -ge 1 ] || usage "$USAGE"
    local role="$1" kind
    shift
    local runtime="" model="" effort="" emed="" ehigh="" reason=""
    local h_runtime=0 h_model=0 h_effort=0 h_emed=0 h_ehigh=0 h_reason=0
    while [ "$#" -gt 0 ]; do
        [ "$#" -ge 2 ] || usage "$1 needs a value"
        case "$1" in
            --runtime) runtime="$2"; h_runtime=1 ;;
            --model) model="$2"; h_model=1 ;;
            --effort) effort="$2"; h_effort=1 ;;
            --effort-medium) emed="$2"; h_emed=1 ;;
            --effort-high) ehigh="$2"; h_ehigh=1 ;;
            --reason) reason="$2"; h_reason=1 ;;
            *) usage "unexpected argument '$1'" ;;
        esac
        shift 2
    done

    # 1. The request itself: no I/O yet.
    [ "$h_reason" -eq 1 ] || refuse "--reason is required"
    case "$reason" in *$'\n'*|*$'\r'*) refuse "--reason must be one line" ;; esac
    [ -n "${reason//[[:space:]]/}" ] || refuse "--reason is required"
    [ "$h_effort" -eq 0 ] || [ "$((h_emed + h_ehigh))" -eq 0 ] || refuse "use either --effort or --effort-medium/--effort-high"
    [ "$((h_runtime + h_model + h_effort + h_emed + h_ehigh))" -gt 0 ] || refuse "nothing to change: give --runtime, --model or an effort"
    [ "$h_runtime" -eq 0 ] || safe_value --runtime "$runtime"
    [ "$h_model" -eq 0 ] || safe_value --model "$model"
    [ "$h_effort" -eq 0 ] || safe_value --effort "$effort"
    [ "$h_emed" -eq 0 ] || safe_value --effort-medium "$emed"
    [ "$h_ehigh" -eq 0 ] || safe_value --effort-high "$ehigh"
    kind="$(role_kind "$role")" || refuse "unknown role '$role' (known: $(all_roles))"
    if [ "$kind" = code ]; then
        [ "$h_effort" -eq 0 ] || refuse "$role has two efforts: use --effort-medium and --effort-high"
    else
        [ "$((h_emed + h_ehigh))" -eq 0 ] || refuse "$role is a content role with one effort: use --effort"
    fi

    # 2. The repository: primary clone, on the trunk, nothing else pending.
    local primary_real repo_real trunk rc out remote_sha branch rel conf key state sp
    [ -n "$PRIMARY" ] || refuse "not a git repository root: cannot locate the primary clone"
    primary_real="$(cd "$PRIMARY" && pwd -P)"; repo_real="$(cd "$REPO_ROOT" && pwd -P)"
    [ "$primary_real" = "$repo_real" ] || refuse "not the primary clone ($PRIMARY): run $PRIMARY/scripts/roles.sh"
    rc=0; G ls-remote --exit-code --heads origin refs/heads/dev >/dev/null 2>&1 </dev/null || rc=$?
    case "$rc" in
        0) trunk=dev ;;
        2) trunk=main ;;
        *) refuse "cannot determine the trunk of origin (ls-remote exit $rc)" ;;
    esac
    branch="$(G symbolic-ref -q --short HEAD 2>/dev/null)" || branch=""
    [ "$branch" = "$trunk" ] || refuse "not on the trunk: HEAD is '${branch:-detached}', the trunk is '$trunk'"
    G diff --cached --quiet || refuse "the index is not empty; commit or unstage first"
    # An empty index does not mean a clean repository: the commit would conclude the operation and
    # the rollback (`reset --soft`) would delete its state file.
    for state in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
        sp="$(G rev-parse --git-path "$state")"
        case "$sp" in /*) ;; *) sp="$REPO_ROOT/$sp" ;; esac
        [ ! -e "$sp" ] || refuse "a merge, cherry-pick, revert or rebase is in progress ($state exists); finish or abort it first"
    done
    rel="$(role_rel "$role")"; conf="$REPO_ROOT/$rel"
    G ls-files --error-unmatch -- "$rel" >/dev/null 2>&1 || refuse "$rel is not tracked"
    G diff --quiet -- "$rel" || refuse "$rel has unstaged changes"
    out="$(G ls-remote origin "refs/heads/$trunk" </dev/null)" || refuse "cannot read origin/$trunk"
    remote_sha="${out%%[[:space:]]*}"
    # ls-remote, not fetch: a refusal must not move any local ref.
    [ -n "$remote_sha" ] && [ "$(G rev-parse HEAD)" = "$remote_sha" ] ||
        refuse "HEAD ($(G rev-parse --short HEAD)) is not at origin/$trunk (${remote_sha:0:7}): it is ahead or behind"
    rc=0; G config --bool roles.requireSignedCommits >/dev/null 2>&1 || rc=$?
    [ "$rc" -le 1 ] || refuse "roles.requireSignedCommits is not a boolean"

    # 3. The candidate: the changed lines, then the whole tuple through the check.
    local n=0 suffix new old
    load_role "$role"
    for suffix in RUNTIME MODEL EFFORT EFFORT_MEDIUM EFFORT_HIGH; do
        case "$suffix" in
            RUNTIME) [ "$h_runtime" -eq 1 ] && new="$runtime" || continue ;;
            MODEL) [ "$h_model" -eq 1 ] && new="$model" || continue ;;
            EFFORT) [ "$h_effort" -eq 1 ] && new="$effort" || continue ;;
            EFFORT_MEDIUM) [ "$h_emed" -eq 1 ] && new="$emed" || continue ;;
            EFFORT_HIGH) [ "$h_ehigh" -eq 1 ] && new="$ehigh" || continue ;;
        esac
        key="${role}_$suffix"
        [ "$(conf_count "$conf" "$key")" = 1 ] || refuse "$rel has no single line $key=\"...\" (a role or key is never added or removed here)"
        old="$(conf_get "$conf" "$key")"
        [ "$old" != "$new" ] || continue
        KEYS[$n]="$key"; OLDS[$n]="$old"; NEWS[$n]="$new"
        n=$((n + 1))
        case "$suffix" in
            RUNTIME) R_RUNTIME="$new" ;;
            MODEL) R_MODEL="$new" ;;
            EFFORT|EFFORT_MEDIUM) R_E1="$new" ;;
            EFFORT_HIGH) R_E2="$new" ;;
        esac
    done
    [ "$n" -gt 0 ] || refuse "nothing to change: every value is already as requested"
    if [ "$role" = REVIEWER_FALLBACK ] && [ -z "$R_RUNTIME$R_MODEL$R_E1$R_E2" ]; then
        PROBLEMS=""
    else
        tuple_check "$R_RUNTIME" "$R_MODEL" "$R_E1" "$R_E2" || refuse "the candidate $role fails check: $PROBLEMS"
    fi
    [ -z "$WARNS" ] || echo "roles: warning: $WARNS" >&2

    # 4. Edit, commit, push. From here every failure rolls back to $ORIG.
    local orig i msg sign=""
    orig="$(G rev-parse HEAD)"
    saved="$(mktemp)"; work="$(mktemp)"   # globals: the EXIT trap runs after this function returns
    # A signal exits through the EXIT trap, which rolls back while NEED_ROLLBACK=1 (only inside this
    # function, so its locals are still in scope), then removes the temp files.
    trap 'st=$?; trap - EXIT INT TERM; [ "$NEED_ROLLBACK" != 1 ] || rollback; rm -f "$saved" "$work" "$work.next"; exit "$st"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    cat "$conf" > "$saved"
    rollback() {
        NEED_ROLLBACK=0
        G reset -q --soft "$orig" || true
        G reset -q HEAD -- "$rel" || true
        cat "$saved" > "$conf"
        [ "$(G rev-parse HEAD)" = "$orig" ] || { echo "roles: ROLLBACK INCOMPLETE: HEAD is not $orig" >&2; exit 1; }
        [ -z "$(G diff --cached --name-only)" ] || { echo "roles: ROLLBACK INCOMPLETE: index is not empty" >&2; exit 1; }
    }
    cat "$saved" > "$work"
    msg=""
    i=0
    while [ "$i" -lt "$n" ]; do
        key="${KEYS[$i]}"; old="${OLDS[$i]}"; new="${NEWS[$i]}"
        i=$((i + 1))
        KEY="$key" OLD="$old" NEW="$new" awk '
            BEGIN { o = ENVIRON["KEY"] "=\"" ENVIRON["OLD"] "\""; w = ENVIRON["KEY"] "=\"" ENVIRON["NEW"] "\"" }
            $0 == o { print w; next }
            { print }' "$work" > "$work.next"
        cat "$work.next" > "$work"
        msg="${msg:+$msg, }$key $(shown "$old") → $(shown "$new")"
    done
    NEED_ROLLBACK=1
    cat "$work" > "$conf"
    if [ "$(diff "$saved" "$conf" | grep -c '^<')" -ne "$n" ] || [ "$(diff "$saved" "$conf" | grep -c '^>')" -ne "$n" ]; then
        rollback; refuse "internal error: the edit changed more than the $n targeted line(s); rolled back"
    fi
    [ "$(G config --bool roles.requireSignedCommits 2>/dev/null || true)" != true ] || sign="-S"
    msg="roles: $msg ($reason)"
    if ! { G add -- "$rel" && G commit -q ${sign:+"$sign"} -m "$msg"; }; then
        rollback; refuse "commit failed; rolled back"
    fi
    if ! G push origin "HEAD:refs/heads/$trunk"; then
        rollback; refuse "push to origin/$trunk failed; rolled back to ${orig:0:7}"
    fi
    NEED_ROLLBACK=0
    echo "roles: $msg -> pushed to origin/$trunk"
}

[ "$#" -ge 1 ] || usage "$USAGE"
cmd="$1"; shift
case "$cmd" in
    list) [ "$#" -eq 0 ] || usage "list takes no argument"; cmd_list ;;
    check) cmd_check "$@" ;;
    get) cmd_get "$@" ;;
    set) cmd_set "$@" ;;
    *) usage "$USAGE" ;;
esac
