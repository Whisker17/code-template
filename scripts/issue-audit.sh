#!/usr/bin/env bash
# Read-only audit: every open issue has exactly one home (GitHub Issues binding).
#
# Usage:
#   scripts/issue-audit.sh --repo owner/repo
#
# Homes (docs/agents/trackers/github.md § Issue homes):
#   version      title prefix [X.Y.Z] (three or four segments) AND milestone vX.Y.Z, equal;
#                an `orchestration` issue needs the milestone only, exactly vX.Y.Z, and no other
#                home; only then is it exempt from the state label
#   governance   label `governance`          backlog   label `backlog`
#   non-code     one label from NON_CODE_HOMES below (no worktree, no PR, no state label)
# Work issues (version, governance, backlog) carry exactly one state label. `ready-for-agent`
# never sits with `needs-design`. A `needs-design` issue without a draft is not a finding: that
# gate is enforced at pickup by /implement and /orchestrate.
#
# Output: one line per finding, `#<n> <reason>`, ordered by issue number. Pull requests (the
# issues API lists them) and closed issues are ignored. Reads every page: `gh api --paginate
# --slurp`. Needs bash, gh and python3 (stdlib only).
#
# Exit code: 0 clean, 1 findings, 2 the tracker could not be read (gh failed, JSON invalid or
# not the --slurp shape) or a usage error -- never "clean".

set -euo pipefail

# >>> CONFIG: the only block a project edits >>>
NON_CODE_HOMES="topic"                       # space-separated labels of non-code issue homes
STATE_LABELS="todo in-progress in-review"    # exactly one on a work issue
# <<< CONFIG <<<

usage() { echo "issue-audit: $*" >&2; echo "usage: issue-audit.sh --repo owner/repo" >&2; exit 2; }

[ "$#" -eq 2 ] && [ "$1" = "--repo" ] || usage "expected exactly: --repo owner/repo"
REPO="$2"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ && "/$REPO/" != *"/./"* && "/$REPO/" != *"/../"* ]] ||
    usage "--repo must be owner/repo (no . or .. segment)"
command -v gh >/dev/null 2>&1 || { echo "issue-audit: gh not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "issue-audit: python3 not found" >&2; exit 2; }

PAGES="$(mktemp)"
trap 'rm -f "$PAGES"' EXIT
gh api --paginate --slurp "repos/$REPO/issues?state=open&per_page=100" > "$PAGES" ||
    { echo "issue-audit: gh failed reading the open issues of $REPO" >&2; exit 2; }

rc=0
python3 - "$PAGES" "$NON_CODE_HOMES" "$STATE_LABELS" <<'PYEOF' || rc=$?
import json
import re
import sys

PREFIX = re.compile(r"^\[(\d+\.\d+\.\d+(?:\.\d+)?)\]")
MILESTONE = re.compile(r"^v(\d+\.\d+\.\d+(?:\.\d+)?)$")
FINDINGS, CLEAN, UNREADABLE = 10, 0, 20  # the shell maps these to exit 1 / 0 / 2


def read_issues(path):
    with open(path) as f:
        pages = json.load(f)
    if not isinstance(pages, list):
        raise ValueError("not an array of pages")
    issues = []
    for page in pages:
        if not isinstance(page, list):
            raise ValueError("page is not an array")
        for item in page:
            if not isinstance(item, dict) or type(item.get("number")) is not int:
                raise ValueError("issue without a number")
            if "pull_request" in item or item.get("state", "open") != "open":
                continue
            labels = item.get("labels")
            milestone = item.get("milestone")
            if not isinstance(item.get("title"), str) or not isinstance(labels, list):
                raise ValueError("issue without title or labels")
            if not all(isinstance(lb, dict) and isinstance(lb.get("name"), str) for lb in labels):
                raise ValueError("malformed label")
            if milestone is not None and not (
                isinstance(milestone, dict) and isinstance(milestone.get("title"), str)
            ):
                raise ValueError("malformed milestone")
            issues.append(item)
    return issues


def audit(item, non_code, states):
    labels = {lb["name"] for lb in item["labels"]}
    match = PREFIX.match(item["title"])
    prefix = match.group(1) if match else None
    # any milestone object is a version home, whatever its title (even "")
    milestone = item["milestone"]["title"] if item["milestone"] is not None else None
    orchestration = "orchestration" in labels

    homes = []
    if prefix or milestone is not None:
        homes.append("version")
    homes += [h for h in ("governance", "backlog") if h in labels]
    homes += [h for h in non_code if h in labels]

    out = []
    if not homes:
        out.append("no home")
    elif len(homes) > 1:
        out.append("multiple homes: " + ", ".join(homes))
    elif homes == ["version"]:
        if prefix and milestone is None:
            out.append("version prefix without milestone")
        elif milestone is not None and not prefix:
            if not orchestration:
                out.append("milestone without version prefix")
        else:
            found = MILESTONE.match(milestone)
            if not found or found.group(1) != prefix:
                out.append(
                    f"version prefix {prefix} differs from milestone '{milestone}' "
                    f"(expected v{prefix})"
                )

    orchestration_ok = (
        orchestration
        and homes == ["version"]
        and milestone is not None
        and MILESTONE.match(milestone) is not None
    )
    if orchestration and not orchestration_ok:
        out.append("orchestration needs exactly the version home with milestone vX.Y.Z")

    exempt = orchestration_ok or any(h in labels for h in non_code)
    if homes and not exempt:
        have = [s for s in states if s in labels]
        if not have:
            out.append("no state label (expected one of: " + ", ".join(states) + ")")
        elif len(have) > 1:
            out.append("multiple state labels: " + ", ".join(have))
    if "ready-for-agent" in labels and "needs-design" in labels:
        out.append("ready-for-agent together with needs-design")
    return out


def main():
    path, non_code, states = sys.argv[1], sys.argv[2].split(), sys.argv[3].split()
    try:
        issues = read_issues(path)
    except (OSError, ValueError) as err:  # json.JSONDecodeError is a ValueError
        print(f"issue-audit: unreadable issue list: {err}", file=sys.stderr)
        return UNREADABLE
    lines = [
        f"#{item['number']} {reason}"
        for item in sorted(issues, key=lambda i: i["number"])
        for reason in audit(item, non_code, states)
    ]
    if lines:
        print("\n".join(lines))
    return FINDINGS if lines else CLEAN


try:
    code = main()
except Exception as err:  # fail closed: a bug here must never read as "clean" or as findings
    print(f"issue-audit: internal error: {err!r}", file=sys.stderr)
    code = UNREADABLE
sys.exit(code)
PYEOF
case "$rc" in
    0) exit 0 ;;
    10) exit 1 ;;
    *) exit 2 ;;
esac
