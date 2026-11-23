"""Smoke E2E: scripts/cut-release.sh and the pre-push hook's release-cut admission.

An agent may cut `release/vX.Y.Z` from the trunk tip when four conditions hold
(docs/GIT_WORKFLOW.md § Agent release cut). The hook is the trust boundary: it must admit that one
ref creation and nothing else under `release/v*`. These cases were written first, from the issue's
`## Failure modes`: every way the script or the hook could wrongly create a ref has its own case,
and a refused cut must leave the remote byte-for-byte as it was.

script (must exit non-zero, remote unchanged):
* (2) the milestone is not open, `gh` fails, or its title is only a near miss (`v0.3.10`, a quote
  inside a description); for Linear the agent's `--linear-release-open` is required and recorded
* (3) tag `vX.Y.Z` exists   (4) X.Y.Z is not greater than the highest three-segment `v*` tag
  (numeric, not lexicographic), or the remote has no such tag at all
* `release/vX.Y.Z` already exists, `git ls-remote` fails, the remote has no trunk
* the version or the options are malformed

hook (the push is refused naming `[rule]`, no ref created):
* single-ref, release-name, new-ref-only (update, delete, existing), trunk-tip (a non-tip or stale
  sha), tag-absent, version-greater

Real `git push` against a scratch bare remote with the hook under test (also run by /bin/bash,
3.2 on macOS); a fake `gh` on PATH. No network, model CLI or credential is used.
"""

import shutil
import subprocess
from pathlib import Path

import pytest
from test_role_binding_lane import BASHES, GIT_ENV, ROOT, Scratch

CUT_SH = ROOT / "scripts" / "cut-release.sh"
OPEN_V031 = '[[{"number":1,"title":"v0.3.1","state":"open"}]]'
FAKE_GH = """#!/bin/sh
echo "gh $*" >> "$FAKE_LOG/calls"
cat "$FAKE_GH_OUT"
exit "${FAKE_GH_RC:-0}"
"""
NEW = "refs/heads/release/v0.3.1"


@pytest.fixture(params=BASHES, ids=lambda b: b)
def bash(request: pytest.FixtureRequest) -> str:
    return request.param


class Cut:
    """A Scratch remote with tags, the script copied into its clone, a fake `gh` first on PATH."""

    def __init__(
        self,
        tmp: Path,
        bash: str,
        tags: tuple[str, ...] = ("v0.3.0", "v0.3.0.1"),
        branches: tuple[str, ...] = ("main", "dev"),
    ):
        self.s = Scratch(tmp, bash, branches)
        self.bash, self.tmp = bash, tmp
        for tag in tags:
            self.s.git("tag", tag, self.s.base)
            self.s.git("push", "-q", "origin", f"refs/tags/{tag}")
        (self.s.clone / "scripts").mkdir()
        shutil.copy(CUT_SH, self.s.clone / "scripts" / "cut-release.sh")
        fakebin = tmp / "fakebin"
        fakebin.mkdir()
        (fakebin / "gh").write_text(FAKE_GH)
        (fakebin / "gh").chmod(0o755)
        (tmp / "log").mkdir()
        (tmp / "gh-out").write_text(OPEN_V031)
        self.env = {
            **GIT_ENV,
            "PATH": f"{fakebin}:{GIT_ENV['PATH']}",
            "FAKE_LOG": str(tmp / "log"),
            "FAKE_GH_OUT": str(tmp / "gh-out"),
        }

    def run(
        self, *args: str, gh_out: str | None = None, gh_rc: int = 0
    ) -> subprocess.CompletedProcess[str]:
        if gh_out is not None:
            (self.tmp / "gh-out").write_text(gh_out)
        return subprocess.run(
            [self.bash, str(self.s.clone / "scripts" / "cut-release.sh"), *args],
            cwd=self.s.clone,
            capture_output=True,
            text=True,
            env={**self.env, "FAKE_GH_RC": str(gh_rc)},
        )

    def github(self, version: str = "0.3.1", **kw: object) -> subprocess.CompletedProcess[str]:
        return self.run(version, "--github-repo", "o/r", **kw)  # type: ignore[arg-type]

    def calls(self) -> list[str]:
        log = self.tmp / "log" / "calls"
        return log.read_text().splitlines() if log.exists() else []

    def refs(self) -> str:
        return self.s.git("--git-dir", str(self.s.origin), "for-each-ref")

    def refused(self, result: subprocess.CompletedProcess[str], before: str) -> None:
        assert result.returncode != 0, result.stdout + result.stderr
        assert self.refs() == before
        assert "(agent)" not in result.stdout


@pytest.fixture
def c(bash: str, tmp_path: Path) -> Cut:
    return Cut(tmp_path, bash)


def advance_dev(c: Cut) -> str:
    """The remote trunk moves on: push a new commit to dev, then reset the clone's origin/dev."""
    tip = c.s.commit({"app.txt": b"app2\n"}, "dev moves")
    c.s.git("push", "-q", "origin", "HEAD:refs/heads/dev", ALLOW_DIRECT_PUSH="1")
    return tip


# --- the cut: success ----------------------------------------------------------------------------


@pytest.mark.smoke
def test_cut_creates_release_at_the_remote_dev_tip_and_records_it(c: Cut) -> None:
    result = c.github()
    assert result.returncode == 0, result.stderr
    tip = c.s.remote("dev")
    assert c.s.remote("release/v0.3.1") == tip
    assert f"cut release/v0.3.1 at {tip} (agent)" in result.stdout
    assert c.calls() == ["gh api --paginate --slurp repos/o/r/milestones?state=open"]
    assert c.s.remote("main") == c.s.base


@pytest.mark.smoke
def test_cut_uses_the_fresh_remote_tip_not_a_stale_local_one(c: Cut) -> None:
    tip = advance_dev(c)
    c.s.git("update-ref", "refs/remotes/origin/dev", c.s.base)
    result = c.github()
    assert result.returncode == 0, result.stderr
    assert c.s.remote("release/v0.3.1") == tip != c.s.base


@pytest.mark.smoke
def test_cut_from_main_when_the_remote_has_no_dev(bash: str, tmp_path: Path) -> None:
    c = Cut(tmp_path, bash, branches=("main",))
    result = c.github()
    assert result.returncode == 0, result.stderr
    assert c.s.remote("release/v0.3.1") == c.s.remote("main")


@pytest.mark.smoke
def test_cut_ignores_four_segment_and_malformed_tags_and_compares_numerically(
    bash: str, tmp_path: Path
) -> None:
    c = Cut(
        tmp_path, bash, tags=("v0.3.9", "v9.9.9.9", "v99.0.0-rc1", "v100.1", "nightly", "v01.0.0")
    )
    result = c.github("0.3.10", gh_out='[[{"title":"v0.3.10"}]]')
    assert result.returncode == 0, result.stderr
    assert c.s.remote("release/v0.3.10") == c.s.remote("dev")


@pytest.mark.smoke
def test_cut_finds_the_milestone_on_a_later_page(c: Cut) -> None:
    result = c.github(gh_out='[[{"title":"v0.2.0"}],[{"title":"v0.3.1"}]]')
    assert result.returncode == 0, result.stderr


@pytest.mark.smoke
def test_cut_with_linear_evidence_records_the_url_verbatim_and_never_calls_gh(c: Cut) -> None:
    url = "https://linear.app/o/release/0.3.1-abc"
    result = c.run("0.3.1", "--linear-release-open", url)
    assert result.returncode == 0, result.stderr
    assert url in result.stdout
    assert f"cut release/v0.3.1 at {c.s.remote('dev')} (agent)" in result.stdout
    assert c.s.remote("release/v0.3.1") == c.s.remote("dev")
    assert c.calls() == []


# --- the cut: every refusal leaves the remote untouched ------------------------------------------

GH_CASES = {
    "milestone-not-open": dict(gh_out='[[{"title":"v0.3.0"}]]'),
    "no-milestones": dict(gh_out="[[]]"),
    "gh-fails": dict(gh_out=OPEN_V031, gh_rc=1),
    "gh-fails-with-no-output": dict(gh_out="", gh_rc=4),
    "near-miss-title": dict(gh_out='[[{"title":"v0.3.10"}]]'),
    "title-only-quoted-in-a-description": dict(
        gh_out='[[{"title":"v0.2.0","description":"{\\"title\\":\\"v0.3.1\\"}"}]]'
    ),
    "title-without-the-v": dict(gh_out='[[{"title":"0.3.1"}]]'),
}


@pytest.mark.smoke
@pytest.mark.parametrize("name", GH_CASES)
def test_cut_refuses_when_the_milestone_is_not_open_or_gh_fails(c: Cut, name: str) -> None:
    before = c.refs()
    c.refused(c.github(**GH_CASES[name]), before)  # type: ignore[arg-type]


TAG_CASES = {
    "tag-already-exists": ((("v0.3.0", "v0.3.1")), "0.3.1"),
    "equal-to-the-highest": (("v0.3.1",), "0.3.1"),
    "lower-than-the-highest": (("v0.3.0", "v0.4.0"), "0.3.1"),
    "major-lower": (("v1.0.0",), "0.3.1"),
    "numeric-not-lexicographic": (("v0.3.10",), "0.3.9"),
    "no-v-tag-at-all": (("nightly", "1.0.0"), "0.3.1"),
    "only-four-segment-and-malformed-tags": (("v0.3.0.1", "v0.3"), "0.3.1"),
    "no-tags": ((), "0.3.1"),
}


@pytest.mark.smoke
@pytest.mark.parametrize("name", TAG_CASES)
def test_cut_refuses_on_tag_conditions(bash: str, tmp_path: Path, name: str) -> None:
    tags, version = TAG_CASES[name]
    c = Cut(tmp_path, bash, tags=tags)
    before = c.refs()
    c.refused(c.github(version, gh_out=f'[[{{"title":"v{version}"}}]]'), before)


@pytest.mark.smoke
def test_cut_refuses_when_the_release_branch_already_exists(c: Cut) -> None:
    c.s.git("push", "-q", "origin", f"{c.s.base}:{NEW}", ALLOW_DIRECT_PUSH="1")
    advance_dev(c)
    before = c.refs()
    c.refused(c.github(), before)
    assert c.s.remote("release/v0.3.1") == c.s.base


@pytest.mark.smoke
def test_cut_refuses_when_ls_remote_fails(c: Cut) -> None:
    c.s.git("remote", "set-url", "origin", str(c.tmp / "nowhere.git"))
    result = c.github()
    assert result.returncode != 0
    assert "(agent)" not in result.stdout


@pytest.mark.smoke
def test_cut_refuses_when_the_remote_has_neither_dev_nor_main(bash: str, tmp_path: Path) -> None:
    c = Cut(tmp_path, bash, branches=("trunk",))
    before = c.refs()
    c.refused(c.github(), before)


@pytest.mark.smoke
@pytest.mark.parametrize(
    "version", ["0.3", "v0.3.1", "00.3.1", "0.03.1", "0.3.1.1", "0.3.1-rc1", "1.2.x", " 0.3.1", ""]
)
def test_cut_refuses_a_malformed_version(c: Cut, version: str) -> None:
    before = c.refs()
    c.refused(c.github(version, gh_out='[[{"title":"v0.3.1"}]]'), before)
    assert c.calls() == []


USAGE_CASES = {
    "no-evidence-option": ["0.3.1"],
    "both-options": ["0.3.1", "--github-repo", "o/r", "--linear-release-open", "https://x/1"],
    "github-repo-without-value": ["0.3.1", "--github-repo"],
    "github-repo-not-owner-slash-repo": ["0.3.1", "--github-repo", "o"],
    "github-repo-with-a-query": ["0.3.1", "--github-repo", "o/r?x=1"],
    "github-repo-dotdot-owner": ["0.3.1", "--github-repo", "../user"],
    "github-repo-dotdot-name": ["0.3.1", "--github-repo", "owner/.."],
    "github-repo-dot-segment": ["0.3.1", "--github-repo", "./r"],
    "linear-url-empty": ["0.3.1", "--linear-release-open", ""],
    "unknown-option": ["0.3.1", "--github-repo", "o/r", "--force"],
    "no-arguments": [],
}


@pytest.mark.smoke
@pytest.mark.parametrize("name", USAGE_CASES)
def test_cut_refuses_a_usage_error(c: Cut, name: str) -> None:
    before = c.refs()
    c.refused(c.run(*USAGE_CASES[name]), before)
    assert c.calls() == []


# --- the hook: what may create release/v* directly -----------------------------------------------


def hook_refused(
    s: Scratch, result: subprocess.CompletedProcess[str], rule: str, before: str | None = None
) -> None:
    assert result.returncode != 0, result.stderr
    assert f"[{rule}]" in result.stderr, result.stderr
    assert "release cut refused" in result.stderr
    assert s.git("--git-dir", str(s.origin), "for-each-ref", "refs/heads/release") == (before or "")


@pytest.mark.smoke
def test_hook_admits_the_trunk_tip_as_a_new_release_without_override(c: Cut) -> None:
    tip = c.s.remote("dev")
    result = c.s.push(f"{tip}:refs/heads/release/v0.4.0")
    assert result.returncode == 0, result.stderr
    assert c.s.remote("release/v0.4.0") == tip
    assert "release cut" in result.stderr and "admitted" in result.stderr


@pytest.mark.smoke
def test_hook_refuses_a_non_tip_sha_for_a_new_release(c: Cut) -> None:
    c.s.commit({"app.txt": b"other\n"}, "not on dev")
    hook_refused(c.s, c.s.push("HEAD:refs/heads/release/v0.4.0"), "trunk-tip")


@pytest.mark.smoke
def test_hook_refuses_the_stale_sha_after_dev_moved(c: Cut) -> None:
    old = c.s.remote("dev")
    advance_dev(c)
    hook_refused(c.s, c.s.push(f"{old}:refs/heads/release/v0.4.0"), "trunk-tip")


@pytest.mark.smoke
def test_hook_admits_the_main_tip_when_the_remote_has_no_dev(bash: str, tmp_path: Path) -> None:
    c = Cut(tmp_path, bash, branches=("main",))
    assert c.s.push("HEAD:refs/heads/release/v0.4.0").returncode == 0
    assert c.s.remote("release/v0.4.0") == c.s.remote("main")


@pytest.mark.smoke
def test_hook_refuses_the_main_tip_when_the_remote_has_a_dev_that_moved(c: Cut) -> None:
    advance_dev(c)
    hook_refused(c.s, c.s.push(f"{c.s.base}:refs/heads/release/v0.4.0"), "trunk-tip")


HOOK_TAG_CASES = {
    "tag-exists": ("v0.3.0", "release/v0.3.0", "tag-absent"),
    "not-greater": ("v0.3.0", "release/v0.2.9", "version-greater"),
    "numeric-not-lexicographic": ("v0.3.10", "release/v0.3.9", "version-greater"),
}


@pytest.mark.smoke
@pytest.mark.parametrize("name", HOOK_TAG_CASES)
def test_hook_refuses_when_the_tag_conditions_fail(c: Cut, name: str) -> None:
    tag, branch, rule = HOOK_TAG_CASES[name]
    c.s.git("tag", "-f", tag, c.s.base)
    c.s.git("push", "-q", "origin", f"refs/tags/{tag}")
    hook_refused(c.s, c.s.push(f"{c.s.remote('dev')}:refs/heads/{branch}"), rule)


@pytest.mark.smoke
def test_hook_refuses_a_release_when_the_remote_has_no_three_segment_tag(
    bash: str, tmp_path: Path
) -> None:
    c = Cut(tmp_path, bash, tags=("v0.3.0.1", "nightly"))
    hook_refused(c.s, c.s.push("HEAD:refs/heads/release/v0.4.0"), "version-greater")


@pytest.mark.smoke
@pytest.mark.parametrize(
    "branch",
    ["v0.4", "v0.4.0.1", "v04.0.0", "v0.04.0", "v0.4.0-rc1", "v0.4.0/x", "vx", "v"],
)
def test_hook_refuses_a_release_name_that_is_not_three_numeric_segments(
    c: Cut, branch: str
) -> None:
    hook_refused(c.s, c.s.push(f"HEAD:refs/heads/release/{branch}"), "release-name")


@pytest.mark.smoke
def test_hook_refuses_update_and_delete_of_an_existing_release(c: Cut) -> None:
    tip = c.s.remote("dev")
    assert c.s.push(f"{tip}:refs/heads/release/v0.4.0").returncode == 0
    before = c.s.git("--git-dir", str(c.s.origin), "for-each-ref", "refs/heads/release")
    newer = c.s.commit({"app.txt": b"newer\n"}, "newer")
    hook_refused(c.s, c.s.push(f"{newer}:refs/heads/release/v0.4.0"), "new-ref-only", before)
    c.s.git("checkout", "-q", "-B", "alt", tip)
    forced = c.s.commit({"app.txt": b"diverged\n"}, "diverged")
    result = c.s.push(f"{forced}:refs/heads/release/v0.4.0", flags=("-f",))
    hook_refused(c.s, result, "new-ref-only", before)
    hook_refused(c.s, c.s.push(":refs/heads/release/v0.4.0"), "new-ref-only", before)


@pytest.mark.smoke
def test_hook_refuses_a_creation_of_a_release_name_that_exists_remotely(c: Cut) -> None:
    c.s.git("push", "-q", "origin", f"{c.s.base}:refs/heads/release/v0.4.0", ALLOW_DIRECT_PUSH="1")
    before = c.s.git("--git-dir", str(c.s.origin), "for-each-ref", "refs/heads/release")
    # A push that git itself treats as a creation: tell the hook the remote has no such ref.
    result = subprocess.run(
        [c.bash, str(ROOT / ".githooks" / "pre-push"), "origin", str(c.s.origin)],
        input=f"refs/heads/x {c.s.base} refs/heads/release/v0.4.0 {'0' * 40}\n",
        cwd=c.s.clone,
        capture_output=True,
        text=True,
        env=GIT_ENV,
    )
    assert result.returncode != 0 and "[new-ref-only]" in result.stderr, result.stderr
    assert c.s.git("--git-dir", str(c.s.origin), "for-each-ref", "refs/heads/release") == before


@pytest.mark.smoke
def test_hook_refuses_a_multi_ref_push_that_includes_a_release_creation(c: Cut) -> None:
    tip = c.s.remote("dev")
    result = c.s.push(f"{tip}:refs/heads/release/v0.4.0", f"{tip}:refs/heads/feat/x")
    hook_refused(c.s, result, "single-ref")
    assert c.s.remote("feat/x") == ""
    result = c.s.push(f"{tip}:refs/heads/release/v0.4.0", f"{tip}:refs/heads/release/v0.5.0")
    hook_refused(c.s, result, "single-ref")


@pytest.mark.smoke
def test_hook_still_admits_the_override_and_still_refuses_dev_and_main_pushes(c: Cut) -> None:
    c.s.commit({"app.txt": b"other\n"}, "not on dev")
    assert c.s.push("HEAD:refs/heads/release/v0.4.0", ALLOW_DIRECT_PUSH="1").returncode == 0
    result = c.s.push("HEAD:refs/heads/release/v0.4.0-x")
    assert result.returncode != 0
    result = c.s.push("HEAD:refs/heads/dev")
    assert result.returncode != 0 and "refusing to push directly to 'dev'" in result.stderr
