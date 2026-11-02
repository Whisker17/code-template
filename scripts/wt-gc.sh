#!/usr/bin/env bash
# Report (and with --apply, remove) finished worktrees and local branches. It can destroy work,
# so completion must be established positively; anything unproven is preserved.
#
# Usage:
#   scripts/wt-gc.sh                         dry run: classify every worktree and local branch
#   scripts/wt-gc.sh --apply                 act on `done` items only
#   scripts/wt-gc.sh --apply --select <x>    also treat <x> as done; repeatable. <x> is a worktree
#                                            path (e.g. .claude/worktrees/agent-x) or a branch name
#
# Output: one tab-separated line per item: class, kind (wt|branch), target, branch, reason.
# Classes: `done` | `active-or-unknown` | `prunable`.
#
# Rules, in order (the first two groups always win):
#   1. Never touched: the primary clone, the current worktree, branches named main/master/dev/
#      develop/release/*, locked and conflicted (merge/rebase/... in progress) worktrees, even
#      with --select. A dirty worktree is preserved unless it is --select'ed.
#   2. `done` = selected, or every PR for its branch is merged/closed per a SUCCESSFUL `gh` query
#      (`gh` errors, no PR, an open PR, a detached HEAD, "branch equals base" and ancestry or a
#      missing upstream alone are all active-or-unknown). Only a PR whose head is the same-named
#      branch of THIS repository counts (a fork's PR, or a row without those fields, does not).
#      gh honours GH_REPO / GH_HOST / GH_TOKEN.
#   3. The rules in 1 and the HEAD/branch tip are re-read from the live repository right before every
#      mutation (after the `gh` query, before the archive commit, before the worktree removal, before
#      the branch deletion): an item that became dirty, locked, conflicted, checked out in another
#      worktree (or the primary clone), or whose HEAD/tip moved is preserved and reported.
#   4. --apply on a done item: clean and fully contained in a merged PR's head -> remove worktree
#      + delete the branch only if it still sits at the validated tip. Anything else -> commit dirty
#      changes (only for a --select'ed item), tag `archive/<name>`, push the tag to `origin`, verify
#      it on the remote, and only then remove. Any failure leaves the worktree and branch in place
#      and is reported. Never `--force`, never a force-push.
#   `prunable` worktrees (directory gone) are pruned with --apply.
#
# Exit: 0 = nothing `done` left and every --select satisfied; 1 = something is left or failed;
# 2 = usage error (nothing was changed).
#
# Deliberately no `set -e`: a failing check must be handled per item, never abort the run.
# Bash 3.2 compatible (macOS): no associative arrays, no mapfile.

set -u -o pipefail

REMOTE=origin
PROTECTED_RE='^(main|master|dev|develop|release/.*)$'
PR_ROW_RE='^[0-9]+'$'\t''(OPEN|MERGED|CLOSED)'$'\t''[0-9a-f]{40,64}'$'\t''(true|false)'$'\t''.+$'

APPLY=0
SELECTS=()
usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "wt-gc: $*" >&2; exit 2; }

while [ "$#" -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --select) [ "$#" -ge 2 ] || die "--select needs a path or branch"; SELECTS+=("$2"); shift ;;
        --select=*) SELECTS+=("${1#--select=}") ;;
        -h|--help) usage; exit 0 ;;
        *) die "unknown argument '$1' (see --help)" ;;
    esac
    shift
done

git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
phys() { (cd "$1" 2>/dev/null && pwd -P); }
CURRENT=$(phys "$(git rev-parse --show-toplevel)") || die "cannot resolve the current worktree"

# --- worktree inventory (git worktree list --porcelain) ---------------------------------------
WT_PATH=(); WT_BRANCH=(); WT_LOCKED=(); WT_PRUNABLE=(); WT_BARE=()
add_wt() { WT_PATH+=("$1"); WT_BRANCH+=("$2"); WT_LOCKED+=("$3"); WT_PRUNABLE+=("$4"); WT_BARE+=("$5"); }
load_worktrees() {
    WT_PATH=(); WT_BRANCH=(); WT_LOCKED=(); WT_PRUNABLE=(); WT_BARE=()
    local line p="" b="" l=0 pr=0 bare=0
    while IFS= read -r line; do
        case "$line" in
            "worktree "*) p=${line#worktree }; b=""; l=0; pr=0; bare=0 ;;
            "branch "*) b=${line#branch refs/heads/} ;;
            locked*) l=1 ;;
            prunable*) pr=1 ;;
            bare) bare=1 ;;
            "") [ -z "$p" ] || add_wt "$p" "$b" "$l" "$pr" "$bare"; p="" ;;
        esac
    done < <(git worktree list --porcelain; echo)
}
load_worktrees
[ "${#WT_PATH[@]}" -gt 0 ] || die "git worktree list returned nothing"
PRIMARY=$(phys "${WT_PATH[0]}" || echo "${WT_PATH[0]}")

# --- --select validation (before anything is changed) -----------------------------------------
SEL_KEYS=()   # a physical path when the argument is an existing directory, else the raw string
for s in ${SELECTS[@]+"${SELECTS[@]}"}; do
    key=$s; [ ! -d "$s" ] || key=$(phys "$s")
    hit=0
    for i in "${!WT_PATH[@]}"; do
        wp=$(phys "${WT_PATH[$i]}" || echo "${WT_PATH[$i]}")
        if [ "$key" = "$wp" ] || { [ -n "${WT_BRANCH[$i]}" ] && [ "$key" = "${WT_BRANCH[$i]}" ]; }; then
            hit=1
            { [ "$wp" != "$PRIMARY" ] && [ "$wp" != "$CURRENT" ]; } || die "--select '$s' is the primary clone or the current worktree"
        fi
    done
    [ "$hit" -eq 1 ] || git show-ref --verify --quiet "refs/heads/$key" || die "--select '$s' matches no worktree path or local branch"
    SEL_KEYS+=("$key")
done
is_selected() { # <phys path or ""> <branch or "">
    local k
    for k in ${SEL_KEYS[@]+"${SEL_KEYS[@]}"}; do
        { [ -n "$1" ] && [ "$k" = "$1" ]; } || { [ -n "$2" ] && [ "$k" = "$2" ]; } && return 0
    done
    return 1
}

# --- PR query ---------------------------------------------------------------------------------
# Sets PR_VERDICT: unknown (gh failed) | none | open | merged | closed, and PR_NOTE.
# Only PRs headed by <branch> of this repository count: `gh pr list --head` matches the branch name
# across forks, so a row must carry isCrossRepository=false and headRefName=<branch>.
# merged = some MERGED PR whose head contains <tip>; a merged PR with extra local commits is
# `closed` (done, but archived rather than removed).
pr_verdict() { # <branch> <tip>
    PR_VERDICT=unknown; PR_NOTE="gh unavailable or failed; not treated as closed"
    command -v gh >/dev/null 2>&1 || return
    local rows row n state oid cross ref any=0 merged="" open="" last=""
    rows=$(gh pr list --head "$1" --state all --limit 100 --json number,state,headRefOid,isCrossRepository,headRefName \
        --jq '.[] | [.number, .state, .headRefOid, .isCrossRepository, .headRefName] | @tsv' 2>/dev/null) || return
    while IFS= read -r row; do
        [ -n "$row" ] || continue
        [[ $row =~ $PR_ROW_RE ]] || { PR_NOTE="unparseable gh output; not treated as closed"; return; }
        IFS=$'\t' read -r n state oid cross ref <<<"$row"
        { [ "$cross" = false ] && [ "$ref" = "$1" ]; } || continue
        any=1; last=$n
        case "$state" in
            OPEN) open=$n ;;
            MERGED) git merge-base --is-ancestor "$2" "$oid" 2>/dev/null && merged=$n ;;
        esac
    done <<<"$rows"
    if [ "$any" -eq 0 ]; then PR_VERDICT=none; PR_NOTE="no PR from this repository for this branch"
    elif [ -n "$open" ]; then PR_VERDICT=open; PR_NOTE="PR #$open is open"
    elif [ -n "$merged" ]; then PR_VERDICT=merged; PR_NOTE="PR #$merged merged"
    else PR_VERDICT=closed; PR_NOTE="PR #$last closed, or merged without all local commits"
    fi
}

# --- per-item state ---------------------------------------------------------------------------
DONE_LEFT=0; FAILED=0
report() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5"; }
fail() { echo "wt-gc: FAILED $1: $2 (worktree and branch kept)" >&2; FAILED=1; }

conflicted() { # <path>
    local gd
    gd=$(git -C "$1" rev-parse --absolute-git-dir 2>/dev/null) || return 0
    local f
    for f in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG rebase-merge rebase-apply; do
        [ ! -e "$gd/$f" ] || return 0
    done
    [ -z "$(git -C "$1" ls-files -u 2>/dev/null | head -n 1)" ] || return 0
    return 1
}
dirty() { # <path>; also true when the status cannot be read
    local out
    out=$(git -C "$1" status --porcelain 2>/dev/null) || return 0
    [ -n "$out" ]
}

remote_tag_sha() { # <tag>; prints the commit sha, empty if absent; returns 1 if the remote is unreadable
    local out
    out=$(git ls-remote --tags "$REMOTE" "refs/tags/$1" "refs/tags/$1^{}" 2>/dev/null) || return 1
    printf '%s\n' "$out" | awk -v r="refs/tags/$1" '$2==r || $2==r"^{}" {s=$1} END {print s}'
}

# archive <name> <path|""> <branch|""> <tip> <selected 0|1>: publish the tag; only a selected item's
# dirty changes are committed first (an unselected one that went dirty is refused, never snapshotted).
archive() {
    local name=$1 path=$2 branch=$3 tag sha rsha why
    tag="archive/$name"
    why=$(blocked_now "$path" "$branch" "$4" "$5")
    [ -z "$why" ] || { fail "$name" "$why; nothing archived"; return 1; }
    if [ -n "$path" ] && [ "$5" -eq 1 ] && dirty "$path"; then
        git -C "$path" add -A \
            && git -C "$path" commit --no-verify -q -m "wip: wt-gc snapshot of $name before cleanup" \
            || { fail "$name" "could not commit the dirty changes"; return 1; }
        ! dirty "$path" || { fail "$name" "worktree still dirty after the snapshot commit"; return 1; }
    fi
    if [ -n "$path" ]; then sha=$(git -C "$path" rev-parse HEAD); else sha=$(git rev-parse "refs/heads/$branch"); fi
    [ -n "$sha" ] || { fail "$name" "cannot resolve the commit to archive"; return 1; }
    local created=0 existing
    if existing=$(git rev-parse -q --verify "refs/tags/$tag^{commit}"); then
        [ "$existing" = "$sha" ] || { fail "$name" "local tag $tag already points at another commit"; return 1; }
    else
        git tag "$tag" "$sha" || { fail "$name" "could not create tag $tag"; return 1; }
        created=1
    fi
    rsha=$(remote_tag_sha "$tag") || { fail "$name" "cannot read tags on $REMOTE"; return 1; }
    if [ -z "$rsha" ]; then
        if ! git push -q "$REMOTE" "refs/tags/$tag:refs/tags/$tag" 2>/dev/null; then
            [ "$created" -eq 0 ] || git tag -d "$tag" >/dev/null 2>&1
            fail "$name" "push of $tag to $REMOTE was rejected or failed"; return 1
        fi
        rsha=$(remote_tag_sha "$tag") || { fail "$name" "cannot verify $tag on $REMOTE"; return 1; }
    fi
    [ "$rsha" = "$sha" ] || { fail "$name" "$REMOTE has $tag at ${rsha:-nothing}, expected $sha"; return 1; }
    ARCHIVED_SHA=$sha
    echo "wt-gc: archived $name as $tag ($sha)"
}

# remove_item <name> <path|""> <branch|""> <expected-tip>: never forced; git itself refuses dirty or
# locked trees, and the branch goes only if it is still at <expected-tip> (a later commit survives).
# `update-ref -d` skips git's checked-out-branch refusal, so that is re-checked here, right before
# and right after the delete (a branch caught checked out by the later check is put back).
remove_item() {
    local why
    why=$(blocked_now "$2" "$3" "$4" 0)
    [ -z "$why" ] || { fail "$1" "$why; nothing removed"; return 1; }
    if [ -n "$2" ]; then
        git worktree remove "$2" 2>/dev/null || { fail "$1" "git worktree remove refused"; return 1; }
    fi
    if [ -n "$3" ]; then
        why=$(blocked_now "" "$3" "$4" 0)
        [ -z "$why" ] || { fail "$1" "$why; branch $3 kept (worktree already removed)"; return 1; }
        git update-ref -d "refs/heads/$3" "$4" 2>/dev/null \
            || { fail "$1" "branch $3 is no longer at $4 or could not be deleted (kept; worktree already removed)"; return 1; }
        why=$(checkout_block "" "$3")
        if [ -n "$why" ]; then
            git update-ref "refs/heads/$3" "$4" "" 2>/dev/null
            fail "$1" "$why while the branch was deleted; branch $3 restored"; return 1
        fi
        git config --remove-section "branch.$3" 2>/dev/null
    fi
    echo "wt-gc: removed $1"
}

# <path|""> <branch|"">: the HEAD sha and symbolic ref as they are now.
head_key() {
    if [ -n "$1" ]; then printf '%s %s' "$(git -C "$1" rev-parse HEAD 2>/dev/null)" "$(git -C "$1" symbolic-ref -q HEAD 2>/dev/null)"
    else printf '%s refs/heads/%s' "$(git rev-parse "refs/heads/$2" 2>/dev/null)" "$2"; fi
}

# checkout_block <path|""> <branch|"">: the live worktree list says why <path> must not be removed
# (locked) or <branch> must not be deleted (checked out in another, non-prunable worktree, the
# primary clone included). Prints nothing when free; an unreadable list blocks.
checkout_block() {
    local out line p="" b="" l=0 pr=0
    out=$(git worktree list --porcelain 2>/dev/null) || { echo "worktree list unreadable"; return; }
    while IFS= read -r line; do
        case "$line" in
            "worktree "*) p=${line#worktree }; b=""; l=0; pr=0 ;;
            "branch "*) b=${line#branch refs/heads/} ;;
            locked*) l=1 ;;
            prunable*) pr=1 ;;
            "") if [ -n "$p" ] && [ "$pr" -eq 0 ]; then
                    if [ -n "$1" ] && [ "$(phys "$p")" = "$1" ]; then
                        [ "$l" -eq 0 ] || { echo "worktree became locked"; return; }
                    elif [ -n "$2" ] && [ "$b" = "$2" ]; then
                        echo "branch became checked out in $p"; return
                    fi
                fi
                p="" ;;
        esac
    done <<<"$out"$'\n'
}

# blocked_now <path|""> <branch|""> <expected-tip> <dirty-ok 0|1>: re-reads, from the live repository,
# every condition that preserves an item and prints why it must not be touched now (nothing = free).
# The verdict taken before the `gh` query is stale; call this right before each mutation.
blocked_now() {
    if [ -n "$1" ]; then
        ! conflicted "$1" || { echo "merge/rebase/cherry-pick began (or state unreadable)"; return; }
        [ "$4" -eq 1 ] || ! dirty "$1" || { echo "uncommitted changes appeared"; return; }
    fi
    [ "$(head_key "$1" "$2")" = "$3 ${2:+refs/heads/$2}" ] || { echo "HEAD or branch tip changed"; return; }
    checkout_block "$1" "$2"
}

# process <kind wt|branch> <path|""> <branch|""> <tip>
process() {
    local kind=$1 path=$2 branch=$3 tip=$4 target sel=0 name reason="" class=active-or-unknown dirty_now=0 why
    target=${path:-$branch}
    if [ "$kind" = wt ]; then name=${path##*/}; else name=${branch//\//-}; fi
    is_selected "$path" "$branch" && sel=1

    # 1. Preservation rules win over everything, including --select.
    if [ "$kind" = wt ] && conflicted "$path"; then reason="merge/rebase/cherry-pick in progress or unreadable"
    elif [ -n "$branch" ] && [[ $branch =~ $PROTECTED_RE ]]; then reason="protected branch name"
    elif [ "$kind" = wt ] && dirty "$path"; then
        dirty_now=1
        [ "$sel" -eq 1 ] || reason="uncommitted changes (use --select to archive them)"
    fi

    # 2. Completion must be positive.
    PR_VERDICT=unknown
    if [ -z "$reason" ]; then
        if [ -n "$branch" ]; then pr_verdict "$branch" "$tip"; else PR_VERDICT=none; PR_NOTE="detached HEAD"; fi
        why=$(blocked_now "$path" "$branch" "$tip" "$sel")
        if [ -n "$why" ]; then reason="$why during the check; preserved"
        elif [ "$sel" -eq 1 ]; then class="done"; reason="selected ($PR_NOTE)"
        else case "$PR_VERDICT" in
            merged|closed) class="done"; reason=$PR_NOTE ;;
            *) reason=$PR_NOTE ;;
        esac; fi
    fi
    report "$class" "$kind" "$target" "${branch:--}" "$reason"

    if [ "$class" != "done" ]; then
        [ "$sel" -eq 0 ] || FAILED=1   # a selected item that was preserved is an unmet request
        return
    fi
    [ "$APPLY" -eq 1 ] || { DONE_LEFT=1; return; }
    if [ "$PR_VERDICT" = merged ] && [ "$dirty_now" -eq 0 ]; then
        remove_item "$name" "$path" "$branch" "$tip"
    else
        archive "$name" "$path" "$branch" "$tip" "$sel" && remove_item "$name" "$path" "$branch" "$ARCHIVED_SHA"
    fi
}

# --- worktrees --------------------------------------------------------------------------------
HAS_PRUNABLE=0
for i in "${!WT_PATH[@]}"; do
    p=${WT_PATH[$i]}; b=${WT_BRANCH[$i]}
    [ "${WT_BARE[$i]}" -eq 0 ] || continue
    if [ "${WT_LOCKED[$i]}" -eq 1 ]; then
        report active-or-unknown wt "$p" "${b:--}" "locked"
        if is_selected "$(phys "$p")" "$b"; then FAILED=1; fi
        continue
    fi
    if [ "${WT_PRUNABLE[$i]}" -eq 1 ]; then
        report prunable wt "$p" "${b:--}" "directory is gone"
        HAS_PRUNABLE=1
        continue
    fi
    pp=$(phys "$p") || { report active-or-unknown wt "$p" "${b:--}" "cannot inspect"; continue; }
    if [ "$pp" = "$PRIMARY" ]; then report active-or-unknown wt "$p" "${b:--}" "primary clone"; continue; fi
    if [ "$pp" = "$CURRENT" ]; then report active-or-unknown wt "$p" "${b:--}" "current worktree"; continue; fi
    tip=$(git -C "$pp" rev-parse HEAD 2>/dev/null) || { report active-or-unknown wt "$p" "${b:--}" "cannot read HEAD"; continue; }
    process wt "$pp" "$b" "$tip"
done
if [ "$HAS_PRUNABLE" -eq 1 ] && [ "$APPLY" -eq 1 ]; then
    git worktree prune && echo "wt-gc: pruned stale worktree entries" || FAILED=1
    load_worktrees
fi

# --- local branches not checked out in any live worktree --------------------------------------
CHECKED_OUT=$'\n'
for i in "${!WT_PATH[@]}"; do
    [ "${WT_PRUNABLE[$i]}" -eq 1 ] || CHECKED_OUT+="${WT_BRANCH[$i]}"$'\n'
done
while IFS= read -r b; do
    [ -n "$b" ] || continue
    case "$CHECKED_OUT" in *$'\n'"$b"$'\n'*) continue ;; esac
    process branch "" "$b" "$(git rev-parse "refs/heads/$b")"
done < <(git for-each-ref --format='%(refname:short)' refs/heads)

if [ "$APPLY" -eq 0 ] && [ "$DONE_LEFT" -eq 1 ]; then
    echo "wt-gc: dry run; rerun with --apply to act on the done items" >&2
fi
[ "$DONE_LEFT" -eq 0 ] && [ "$FAILED" -eq 0 ]
