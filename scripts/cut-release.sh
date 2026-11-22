#!/usr/bin/env bash
# Cut the long-lived integration branch release/vX.Y.Z from the remote trunk tip.
#
# Usage:
#   scripts/cut-release.sh X.Y.Z --github-repo owner/repo
#   scripts/cut-release.sh X.Y.Z --linear-release-open <release-url>
#
# Allowed only when all four conditions hold (docs/GIT_WORKFLOW.md § Agent release cut):
#   1. the issue title prefix and the tracker milestone/Release agree  -- the AGENT checks this
#      against the tracker and records it; this script cannot.
#   2. the milestone/Release is open. GitHub: this script checks that an open milestone titled
#      `vX.Y.Z` exists (`gh` failing aborts). Linear: the agent read the Release through MCP and
#      passes its URL; the script records it verbatim as the agent's evidence.
#   3. tag vX.Y.Z is absent on the remote.
#   4. X.Y.Z is numerically greater than the highest three-segment v* tag on the remote
#      (four-segment hotfix tags and malformed tags are ignored). No such tag at all -> refuse:
#      before the first production tag the version-scoped row resolves to `dev`.
# The trunk is `dev` if the remote has one, else `main`. The push is guarded by
# .githooks/pre-push, which admits exactly this creation (same conditions, no override).
#
# Nothing is created on any refusal. Exit 0: cut; 1: refused or failed; 2: usage error.

set -euo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

die() { echo "cut-release: $*" >&2; exit 1; }
usage() { echo "cut-release: $*" >&2; echo "usage: cut-release.sh X.Y.Z (--github-repo owner/repo | --linear-release-open <release-url>)" >&2; exit 2; }

[ "$#" -ge 1 ] || usage "a version is required"
VERSION="$1"; shift
[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
    usage "malformed version '$VERSION' (expected X.Y.Z: three numeric segments, no leading zeros)"

GITHUB_REPO=""; LINEAR_URL=""; HAVE_LINEAR=0
while [ "$#" -gt 0 ]; do
    case "$1" in
        --github-repo) [ "$#" -ge 2 ] || usage "--github-repo needs owner/repo"; GITHUB_REPO="$2"; shift 2 ;;
        --linear-release-open) [ "$#" -ge 2 ] || usage "--linear-release-open needs the release url"; LINEAR_URL="$2"; HAVE_LINEAR=1; shift 2 ;;
        *) usage "unknown argument '$1'" ;;
    esac
done
if [ -n "$GITHUB_REPO" ] && [ "$HAVE_LINEAR" -eq 1 ]; then usage "give exactly one of --github-repo and --linear-release-open"; fi
if [ -z "$GITHUB_REPO" ] && [ "$HAVE_LINEAR" -eq 0 ]; then usage "give exactly one of --github-repo and --linear-release-open"; fi
if [ -n "$GITHUB_REPO" ]; then
    [[ "$GITHUB_REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || usage "--github-repo must be owner/repo"
else
    [ -n "$LINEAR_URL" ] || usage "--linear-release-open needs a non-empty release url"
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Condition 2.
if [ -n "$GITHUB_REPO" ]; then
    # shortcut: grep the compact JSON for the exact title; fine while a milestone title never
    # carries an unescaped quote (GitHub escapes it, so a description cannot spoof one).
    milestones="$(gh api --paginate --slurp "repos/$GITHUB_REPO/milestones?state=open")" ||
        die "gh failed listing the open milestones of $GITHUB_REPO; nothing cut"
    printf '%s' "$milestones" | grep -Eq "\"title\": *\"v${VERSION//./[.]}\"" ||
        die "no open milestone titled v$VERSION in $GITHUB_REPO (condition 2); nothing cut"
else
    echo "cut-release: condition 2 (Linear) per the agent: release open at $LINEAR_URL"
fi

# Conditions 3 and 4, and the trunk, from the remote itself.
heads="$(git ls-remote --heads origin)" || die "git ls-remote --heads origin failed; nothing cut"
tags="$(git ls-remote --tags origin)" || die "git ls-remote --tags origin failed; nothing cut"
REF="refs/heads/release/v$VERSION"
[ -z "$(printf '%s\n' "$heads" | awk -v r="$REF" '$2 == r')" ] || die "$REF already exists on origin; nothing cut"
for TRUNK in dev main; do
    TIP="$(printf '%s\n' "$heads" | awk -v r="refs/heads/$TRUNK" '$2 == r { print $1; exit }')"
    [ -z "$TIP" ] || break
done
[ -n "$TIP" ] || die "origin has neither dev nor main; nothing cut"

verdict="$(printf '%s\n' "$tags" | LC_ALL=C awk -v want="$VERSION" '
    function cmp(a, b,   i, x, y) {
        split(a, x, "."); split(b, y, ".")
        for (i = 1; i <= 3; i++) {
            if (length(x[i]) != length(y[i])) return length(x[i]) > length(y[i]) ? 1 : -1
            if ((x[i] "") != (y[i] "")) return (x[i] "") > (y[i] "") ? 1 : -1
        }
        return 0
    }
    $2 ~ /^refs\/tags\/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/ {
        v = substr($2, 12); n++
        if (v == want) found = 1
        if (n == 1 || cmp(v, max) > 0) max = v
    }
    END {
        if (!n) print "none"
        else if (found) print "exists"
        else if (cmp(want, max) <= 0) print "notgreater " max
        else print "ok"
    }')"
case "$verdict" in
    ok) ;;
    exists) die "tag v$VERSION already exists on origin (condition 3); nothing cut" ;;
    none) die "origin has no three-segment v* tag: bootstrap resolves to dev (condition 4); nothing cut" ;;
    *) die "$VERSION is not greater than the highest tag v${verdict#notgreater } (condition 4); nothing cut" ;;
esac

git fetch origin "+refs/heads/$TRUNK:refs/remotes/origin/$TRUNK" --tags >/dev/null 2>&1 ||
    die "git fetch origin $TRUNK failed; nothing cut"
[ "$(git rev-parse "refs/remotes/origin/$TRUNK")" = "$TIP" ] ||
    die "origin/$TRUNK moved while checking (now not $TIP); nothing cut, rerun"

# The empty lease value demands the ref be absent: the server refuses if it was created meanwhile.
git push --force-with-lease="$REF:" origin "refs/remotes/origin/$TRUNK:$REF"
echo "cut release/v$VERSION at $TIP (agent)"
