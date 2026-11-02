"""E2E: scripts/wt-gc.sh against a scratch clone with a scratch bare remote.

wt-gc.sh can destroy work, so these are the failure modes the script must survive (written first,
per AGENTS.md § Testing / the issue's `## Failure modes`):

* an active worktree whose branch equals its base, or a sub-agent worktree outside the layout,
  looks "done" and is deleted;
* "gh unreachable" is read as "PR closed";
* the archive tag push is rejected and the worktree is deleted anyway;
* a dirty or locked worktree is removed with --force;
* the current worktree or the primary clone is removed;
* a merged PR hides local commits that never reached it;
* a commit lands while `gh` is being queried and the branch is deleted at the older tip;
* a PR from a fork (or without identity fields) that shares the branch name counts as this
  branch's PR.

Real `git` is used throughout, including a bare `origin` whose `pre-receive` hook can reject tags.
`gh` is replaced by a fake on PATH (the script itself always calls plain `gh`): it answers
`gh pr list --head <branch> ...` from per-branch files (tab-separated number, state, head sha,
isCrossRepository, headRefName), commits into $FAKE_GH_COMMIT_IN first when set, or fails on
demand. A fake is used instead
of a bad GH_HOST because the scratch remote is a local path, so real gh cannot resolve a repo at
all; one extra test still runs the real `gh` (if installed) against an unresolvable host.
Every scenario runs under the PATH bash and, when different, /bin/bash (3.2 on macOS).
"""

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "wt-gc.sh"
BASHES = sorted({b for b in (shutil.which("bash"), "/bin/bash") if b and Path(b).exists()})

FAKE_GH = """#!/bin/sh
[ -z "$FAKE_GH_FAIL" ] || { echo "error connecting to api.github.com" >&2; exit 1; }
[ "$1 $2" = "pr list" ] || exit 64
[ -z "$FAKE_GH_COMMIT_IN" ] || git -C "$FAKE_GH_COMMIT_IN" commit -q --allow-empty -m "late commit"
head=
while [ $# -gt 0 ]; do [ "$1" = --head ] && head=$2; shift; done
f="$FAKE_GH_DIR/$(printf %s "$head" | tr / _)"
[ -f "$f" ] && cat "$f"
exit 0
"""

REJECT_TAGS = """#!/bin/sh
while read -r old new ref; do
    case "$ref" in refs/tags/*) echo "tags are rejected here" >&2; exit 1 ;; esac
done
"""


def git(cwd: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=GIT_ENV)
    if check:
        assert result.returncode == 0, f"git {args}: {result.stderr}"
    return result.stdout.strip()


GIT_ENV = {
    **os.environ,
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@example.com",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@example.com",
}


@dataclass
class Row:
    cls: str
    kind: str
    branch: str
    reason: str


class Scratch:
    def __init__(self, tmp: Path, bash: str) -> None:
        self.tmp, self.bash = tmp, bash
        self.origin = tmp / "origin.git"
        self.primary = tmp / "primary"
        self.layout = tmp / "primary-wt"
        self.gh_dir = tmp / "gh"
        self.gh_dir.mkdir()
        fakebin = tmp / "bin"
        fakebin.mkdir()
        (fakebin / "gh").write_text(FAKE_GH)
        (fakebin / "gh").chmod(0o755)
        self.env = {
            **GIT_ENV,
            "PATH": f"{fakebin}{os.pathsep}{os.environ['PATH']}",
            "FAKE_GH_DIR": str(self.gh_dir),
        }
        subprocess.run(
            ["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], check=True, env=GIT_ENV
        )
        subprocess.run(
            ["git", "clone", "-q", str(self.origin), str(self.primary)],
            check=True,
            capture_output=True,
            env=GIT_ENV,
        )
        git(self.primary, "checkout", "-q", "-b", "main")
        (self.primary / ".gitignore").write_text(".venv/\n.claude/worktrees/\n")
        (self.primary / "app.txt").write_text("base\n")
        git(self.primary, "add", "-A")
        git(self.primary, "commit", "-q", "-m", "base")
        git(self.primary, "push", "-q", "-u", "origin", "main")

    def worktree(self, path: Path, branch: str, pr: str | None = None, commit: bool = True) -> Path:
        """New worktree off main. With `pr` (MERGED|CLOSED|OPEN) the branch gets a pushed commit and
        the fake gh reports that PR state for the pushed head; without it the branch equals main."""
        git(self.primary, "worktree", "add", "-q", "-b", branch, str(path), "main")
        if pr and commit:
            (path / f"{branch.replace('/', '_')}.txt").write_text("work\n")
            git(path, "add", "-A")
            git(path, "commit", "-q", "-m", f"work on {branch}")
            git(path, "push", "-q", "origin", branch)
            self.pr(branch, pr, git(path, "rev-parse", "HEAD"))
        return path

    def pr(self, branch: str, state: str, head: str, row_tail: str | None = None) -> None:
        """Fake gh row; `row_tail` replaces the identity columns (default: this repo, same branch)."""
        tail = f"false\t{branch}" if row_tail is None else row_tail
        row = "\t".join(filter(None, ["1", state, head, tail]))
        (self.gh_dir / branch.replace("/", "_")).write_text(row + "\n")

    def run(
        self, *args: str, cwd: Path | None = None, **env: str
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [self.bash, str(SCRIPT), *args],
            cwd=cwd or self.primary,
            env={**self.env, **env},
            capture_output=True,
            text=True,
        )

    @staticmethod
    def rows(result: subprocess.CompletedProcess[str]) -> dict[str, Row]:
        rows = {}
        for line in result.stdout.splitlines():
            cls, kind, target, branch, reason = line.split("\t")
            rows[Path(target).name if kind == "wt" else f"branch:{target}"] = Row(
                cls, kind, branch, reason
            )
        return rows

    def state(self) -> tuple[str, str, str]:
        return (
            git(self.primary, "worktree", "list", "--porcelain"),
            git(self.primary, "for-each-ref", "refs/heads", "refs/tags"),
            git(self.primary, "ls-remote", "origin"),
        )

    def remote_tags(self) -> list[str]:
        return [
            ln.split()[1]
            for ln in git(self.primary, "ls-remote", "--tags", "origin", "archive/*").splitlines()
        ]


@pytest.fixture(params=BASHES, ids=lambda b: b)
def scratch(request: pytest.FixtureRequest, tmp_path: Path) -> Scratch:
    return Scratch(tmp_path, request.param)


def three_worktrees(s: Scratch) -> tuple[Path, Path, Path]:
    merged = s.worktree(s.layout / "WHI-1", "feat/whi-1", "MERGED")
    closed_dirty = s.worktree(s.layout / "WHI-2", "feat/whi-2", "CLOSED")
    (closed_dirty / "feat_whi-2.txt").write_text("edited after close\n")
    (closed_dirty / "new.txt").write_text("untracked\n")
    (closed_dirty / ".venv").mkdir()
    (closed_dirty / ".venv" / "junk").write_text("ignored build dir\n")
    fresh = s.worktree(s.layout / "WHI-3", "feat/whi-3")
    return merged, closed_dirty, fresh


def test_ac1_dry_run_classifies_and_changes_nothing(scratch: Scratch) -> None:
    three_worktrees(scratch)
    before = scratch.state()

    result = scratch.run()

    rows = scratch.rows(result)
    assert rows["WHI-1"].cls == "done"
    assert rows["WHI-2"].cls == "active-or-unknown" and "uncommitted" in rows["WHI-2"].reason
    assert rows["WHI-3"].cls == "active-or-unknown" and "no PR" in rows["WHI-3"].reason
    assert rows["primary"].cls == "active-or-unknown"
    assert result.returncode == 1, result.stdout + result.stderr  # a done item is left
    assert scratch.state() == before
    assert all(p.is_dir() for p in (scratch.layout / n for n in ("WHI-1", "WHI-2", "WHI-3")))


def test_ac2_apply_removes_only_the_merged_one_then_select_archives_the_dirty_one(
    scratch: Scratch,
) -> None:
    merged, closed_dirty, fresh = three_worktrees(scratch)

    result = scratch.run("--apply")

    assert result.returncode == 0, result.stdout + result.stderr
    assert not merged.exists() and closed_dirty.is_dir() and fresh.is_dir()
    branches = git(scratch.primary, "branch", "--format=%(refname:short)").split()
    assert "feat/whi-1" not in branches and {"feat/whi-2", "feat/whi-3"} <= set(branches)
    assert scratch.remote_tags() == []

    result = scratch.run("--apply", "--select", str(closed_dirty))

    assert result.returncode == 0, result.stdout + result.stderr
    assert scratch.remote_tags() == ["refs/tags/archive/WHI-2"]
    # the archived commit carries the dirty change, the untracked file and not the ignored dir
    assert git(scratch.primary, "show", "archive/WHI-2:feat_whi-2.txt") == "edited after close"
    assert git(scratch.primary, "show", "archive/WHI-2:new.txt") == "untracked"
    assert git(scratch.primary, "ls-tree", "-r", "--name-only", "archive/WHI-2").count(".venv") == 0
    remote_sha = git(scratch.primary, "ls-remote", "origin", "refs/tags/archive/WHI-2").split()[0]
    assert remote_sha == git(scratch.primary, "rev-parse", "archive/WHI-2")
    assert not closed_dirty.exists()
    assert "feat/whi-2" not in git(scratch.primary, "branch", "--format=%(refname:short)").split()
    assert fresh.is_dir() and "feat/whi-3" in git(
        scratch.primary, "branch", "--format=%(refname:short)"
    )


def test_ac3_locked_worktree_is_preserved_even_when_selected(scratch: Scratch) -> None:
    locked = scratch.worktree(scratch.layout / "WHI-4", "feat/whi-4", "CLOSED")
    git(scratch.primary, "worktree", "lock", "--reason", "agent running", str(locked))
    before = scratch.state()

    result = scratch.run("--apply", "--select", str(locked))

    assert scratch.rows(result)["WHI-4"].cls == "active-or-unknown"
    assert "locked" in scratch.rows(result)["WHI-4"].reason
    assert result.returncode == 1  # the explicit request was not satisfied
    assert locked.is_dir() and scratch.state() == before and scratch.remote_tags() == []


def test_ac3_conflicted_and_protected_are_preserved_even_when_selected(scratch: Scratch) -> None:
    conflicted = scratch.worktree(scratch.layout / "WHI-5", "feat/whi-5", "CLOSED")
    git(conflicted, "checkout", "-q", "-b", "side")
    (conflicted / "app.txt").write_text("side\n")
    git(conflicted, "commit", "-qam", "side")
    git(conflicted, "checkout", "-q", "feat/whi-5")
    (conflicted / "app.txt").write_text("mine\n")
    git(conflicted, "commit", "-qam", "mine")
    assert (
        subprocess.run(
            ["git", "merge", "side"], cwd=conflicted, capture_output=True, env=GIT_ENV
        ).returncode
        != 0
    )
    git(scratch.primary, "branch", "dev")
    before = scratch.state()

    result = scratch.run("--apply", "--select", str(conflicted), "--select", "dev")

    rows = scratch.rows(result)
    assert rows["WHI-5"].cls == "active-or-unknown" and "in progress" in rows["WHI-5"].reason
    assert (
        rows["branch:dev"].cls == "active-or-unknown" and "protected" in rows["branch:dev"].reason
    )
    assert result.returncode == 1
    assert conflicted.is_dir() and scratch.state() == before


def test_ac4_gh_failure_is_never_read_as_closed(scratch: Scratch) -> None:
    three_worktrees(scratch)
    git(scratch.primary, "branch", "feat/loose")  # a branch without a worktree
    before = scratch.state()

    result = scratch.run("--apply", FAKE_GH_FAIL="1")

    rows = scratch.rows(result)
    for name in ("WHI-1", "WHI-3", "branch:feat/loose"):
        assert rows[name].cls == "active-or-unknown", name
        assert "gh" in rows[name].reason
    assert result.returncode == 0, result.stdout + result.stderr  # nothing `done` is left
    assert scratch.state() == before


@pytest.mark.skipif(shutil.which("gh") is None, reason="real gh not installed")
def test_ac4_real_gh_against_an_unresolvable_host_preserves_everything(scratch: Scratch) -> None:
    merged = scratch.worktree(scratch.layout / "WHI-1", "feat/whi-1", "MERGED")
    before = scratch.state()
    real_path = {"PATH": f"{Path(str(shutil.which('gh'))).parent}{os.pathsep}{os.environ['PATH']}"}
    bad_host = {
        "GH_REPO": "bad.invalid/o/r",
        "GH_HOST": "bad.invalid",
        "GH_TOKEN": "x",
        "GH_ENTERPRISE_TOKEN": "x",
        "GH_PROMPT_DISABLED": "1",
        **real_path,
    }

    result = scratch.run("--apply", **bad_host)

    assert scratch.rows(result)["WHI-1"].cls == "active-or-unknown"
    assert merged.is_dir() and scratch.state() == before


def test_ac5_rejected_tag_push_keeps_worktree_and_branch(scratch: Scratch) -> None:
    closed_dirty = scratch.worktree(scratch.layout / "WHI-2", "feat/whi-2", "CLOSED")
    (closed_dirty / "feat_whi-2.txt").write_text("precious\n")
    hook = scratch.origin / "hooks" / "pre-receive"
    hook.write_text(REJECT_TAGS)
    hook.chmod(0o755)

    result = scratch.run("--apply", "--select", str(closed_dirty))

    assert result.returncode != 0
    assert "rejected" in result.stderr
    assert closed_dirty.is_dir()
    assert "feat/whi-2" in git(scratch.primary, "branch", "--format=%(refname:short)").split()
    assert (closed_dirty / "feat_whi-2.txt").read_text() == "precious\n"
    assert scratch.remote_tags() == []
    assert git(scratch.primary, "tag", "-l", "archive/*") == ""  # no half-made local archive tag


def test_ac6_select_agent_worktree_removes_only_that_one(scratch: Scratch) -> None:
    agent = scratch.worktree(
        scratch.primary / ".claude" / "worktrees" / "agent-x", "worktree-agent-x"
    )
    other_agent = scratch.worktree(
        scratch.primary / ".claude" / "worktrees" / "agent-y", "worktree-agent-y"
    )
    fresh = scratch.worktree(scratch.layout / "WHI-3", "feat/whi-3")
    plain = scratch.run()
    assert {scratch.rows(plain)[n].cls for n in ("agent-x", "agent-y", "WHI-3")} == {
        "active-or-unknown"
    }
    assert plain.returncode == 0  # unknown-state work alone is not a finding

    result = scratch.run("--apply", "--select", ".claude/worktrees/agent-x")

    assert result.returncode == 0, result.stdout + result.stderr
    assert not agent.exists()
    assert other_agent.is_dir() and fresh.is_dir()
    assert scratch.remote_tags() == ["refs/tags/archive/agent-x"]
    assert (
        "worktree-agent-x"
        not in git(scratch.primary, "branch", "--format=%(refname:short)").split()
    )


def test_current_worktree_and_primary_are_never_removed(scratch: Scratch) -> None:
    current = scratch.worktree(scratch.layout / "WHI-1", "feat/whi-1", "MERGED")

    result = scratch.run("--apply", cwd=current)

    rows = scratch.rows(result)
    assert rows["WHI-1"].cls == "active-or-unknown" and rows["WHI-1"].reason == "current worktree"
    assert rows["primary"].reason == "primary clone"
    assert result.returncode == 0 and current.is_dir()
    refused = scratch.run("--apply", "--select", str(current), cwd=current)
    assert refused.returncode == 2 and current.is_dir()


def test_merged_pr_that_misses_local_commits_is_archived_not_dropped(scratch: Scratch) -> None:
    wt = scratch.worktree(scratch.layout / "WHI-1", "feat/whi-1", "MERGED")
    (wt / "late.txt").write_text("committed after the PR head, never pushed\n")
    git(wt, "add", "-A")
    git(wt, "commit", "-q", "-m", "late")

    result = scratch.run("--apply")

    assert result.returncode == 0, result.stdout + result.stderr
    assert not wt.exists()
    assert scratch.remote_tags() == ["refs/tags/archive/WHI-1"]
    assert git(scratch.primary, "show", "archive/WHI-1:late.txt").startswith("committed after")


def test_open_pr_and_detached_worktrees_are_preserved_without_select(scratch: Scratch) -> None:
    open_pr = scratch.worktree(scratch.layout / "WHI-6", "feat/whi-6", "OPEN")
    detached = scratch.layout / "detached"
    git(scratch.primary, "worktree", "add", "-q", "--detach", str(detached), "main")
    before = scratch.state()

    result = scratch.run("--apply")

    rows = scratch.rows(result)
    assert rows["WHI-6"].cls == "active-or-unknown" and "open" in rows["WHI-6"].reason
    assert rows["detached"].cls == "active-or-unknown"
    assert (
        result.returncode == 0
        and open_pr.is_dir()
        and detached.is_dir()
        and scratch.state() == before
    )


def test_local_branches_without_a_worktree(scratch: Scratch) -> None:
    git(scratch.primary, "branch", "feat/merged-branch", "main")
    git(scratch.primary, "branch", "feat/loose", "main")
    tip = git(scratch.primary, "rev-parse", "feat/merged-branch")
    scratch.pr("feat/merged-branch", "MERGED", tip)

    dry = scratch.run()
    rows = scratch.rows(dry)
    assert rows["branch:feat/merged-branch"].cls == "done"
    assert rows["branch:feat/loose"].cls == "active-or-unknown"
    assert dry.returncode == 1

    applied = scratch.run("--apply")

    branches = git(scratch.primary, "branch", "--format=%(refname:short)").split()
    assert applied.returncode == 0, applied.stdout + applied.stderr
    assert "feat/merged-branch" not in branches and {"feat/loose", "main"} <= set(branches)


def test_prunable_entry_is_pruned_only_with_apply(scratch: Scratch) -> None:
    gone = scratch.worktree(scratch.layout / "WHI-7", "feat/whi-7", "OPEN")
    shutil.rmtree(gone)

    dry = scratch.run()
    assert scratch.rows(dry)["WHI-7"].cls == "prunable"
    assert "WHI-7" in git(scratch.primary, "worktree", "list")

    applied = scratch.run("--apply")

    assert applied.returncode == 0, applied.stdout + applied.stderr
    assert "WHI-7" not in git(scratch.primary, "worktree", "list")
    assert (
        "feat/whi-7" in git(scratch.primary, "branch", "--format=%(refname:short)").split()
    )  # branch kept


def test_select_that_matches_nothing_is_a_usage_error_and_changes_nothing(scratch: Scratch) -> None:
    three_worktrees(scratch)
    before = scratch.state()

    result = scratch.run("--apply", "--select", "no-such-thing")

    assert result.returncode == 2
    assert scratch.state() == before


def test_commit_landing_during_the_gh_query_is_preserved(scratch: Scratch) -> None:
    wt = scratch.worktree(scratch.layout / "WHI-1", "feat/whi-1", "MERGED")
    pushed = git(wt, "rev-parse", "HEAD")

    result = scratch.run("--apply", FAKE_GH_COMMIT_IN=str(wt))

    late = git(wt, "rev-parse", "HEAD")
    assert late != pushed
    row = scratch.rows(result)["WHI-1"]
    assert row.cls == "active-or-unknown" and "preserved" in row.reason
    assert result.returncode == 0, result.stdout + result.stderr
    assert wt.is_dir() and git(scratch.primary, "rev-parse", "feat/whi-1") == late
    assert scratch.remote_tags() == []

    # next run (no further commit): the PR head misses the late commit -> archived, not dropped
    again = scratch.run("--apply")

    assert again.returncode == 0, again.stdout + again.stderr
    assert not wt.exists() and scratch.remote_tags() == ["refs/tags/archive/WHI-1"]
    assert git(scratch.primary, "rev-parse", "archive/WHI-1") == late


@pytest.mark.parametrize(
    "row_tail",
    ["true\tpatch-1", "false\tother-branch", ""],
    ids=["fork-pr", "other-head-branch", "no-identity-fields"],
)
def test_a_pr_that_is_not_this_repos_same_named_branch_never_counts(
    scratch: Scratch, row_tail: str
) -> None:
    wt = scratch.worktree(scratch.layout / "WHI-8", "patch-1")
    scratch.pr("patch-1", "CLOSED", git(wt, "rev-parse", "HEAD"), row_tail=row_tail)
    before = scratch.state()

    result = scratch.run("--apply")

    assert scratch.rows(result)["WHI-8"].cls == "active-or-unknown"
    assert result.returncode == 0, result.stdout + result.stderr
    assert wt.is_dir() and scratch.state() == before
