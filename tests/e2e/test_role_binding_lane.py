"""Smoke E2E: .githooks/pre-push and the role-binding lane (docs/GIT_WORKFLOW.md).

The hook is a trust boundary: it admits a push straight to the trunk, without ALLOW_DIRECT_PUSH,
only when every commit changes binding values in the lane files and nothing else, because those
files are sourced by the dispatcher. These cases were written first, from the issue's
`## Failure modes`; every way the hook could wrongly admit a push has its own case, and every
refused push must leave the remote trunk untouched and name the violated rule on stderr as
`[<rule>]`:

* key-set        a key is added, removed, renamed or reordered, or the line count changes
* binding-lines  a changed line is not `KEY="value"` (comment, blank, binding <-> non-binding)
* value-chars    a value contains `$`, a backtick or a backslash
* nul-byte       the blob contains a NUL byte
* format         CRLF, a missing trailing newline
* file-mode      the mode is not 100644 or the path became a symlink
* lane-paths     a path outside the lane list, or a file added/deleted/renamed/copied
* fast-forward-only, no-merge-commits, existing-ref-only, single-ref, trunk-only, signed-commits

Real `git push` runs against a scratch bare remote with the hook under test (through a wrapper, so
every scenario also runs under /bin/bash, which is 3.2 on macOS). No network, model CLI or
credential is used.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / ".githooks" / "pre-push"
BASHES = sorted(
    {
        os.path.realpath(b): b
        for b in (shutil.which("bash"), "/bin/bash")
        if b and Path(b).exists()
    }.values()
)
ZERO = "0" * 40

GIT_ENV = {
    **{k: v for k, v in os.environ.items() if k != "ALLOW_DIRECT_PUSH"},
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@example.com",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@example.com",
}

AGENT = b"""# Role bindings.
# note: comment line

ORCHESTRATOR_RUNTIME="pi"
ORCHESTRATOR_MODEL="prov/orch"
ORCHESTRATOR_EFFORT_MEDIUM="medium"
ORCHESTRATOR_EFFORT_HIGH="high"

IMPLEMENTER_RUNTIME="pi"
IMPLEMENTER_MODEL="prov/impl"
IMPLEMENTER_EFFORT_MEDIUM="medium"
IMPLEMENTER_EFFORT_HIGH="high"
"""
CONTENT = b"""# Content roles.
SLIDE_RUNTIME="pi"
SLIDE_MODEL="prov/slide"
"""
AGENT_PATH = "config/agent-roles.conf"
CONTENT_PATH = "config/content-roles.conf"


def sub(old: bytes, new: bytes, blob: bytes = AGENT) -> bytes:
    assert old in blob, old
    return blob.replace(old, new, 1)


class Scratch:
    """Bare `origin`, a clone on branch `work`, and the hook under test (run by `bash`)."""

    def __init__(
        self, tmp: Path, bash: str, remote_branches: tuple[str, ...] = ("main", "dev", "release/v9")
    ):
        self.tmp = tmp
        self.origin = tmp / "origin.git"
        self.clone = tmp / "clone"
        subprocess.run(
            ["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], check=True, env=GIT_ENV
        )
        subprocess.run(
            ["git", "clone", "-q", str(self.origin), str(self.clone)],
            check=True,
            capture_output=True,
            env=GIT_ENV,
        )
        self.git("checkout", "-q", "-b", "work")
        self.write({AGENT_PATH: AGENT, CONTENT_PATH: CONTENT, "app.txt": b"app\n"})
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "base")
        self.base = self.git("rev-parse", "HEAD")
        for branch in remote_branches:
            self.git("push", "-q", "origin", f"HEAD:refs/heads/{branch}")
        hooks = tmp / "hooks"
        hooks.mkdir()
        wrapper = hooks / "pre-push"
        wrapper.write_text(f'#!/bin/sh\nexec "{bash}" "{HOOK}" "$@"\n')
        wrapper.chmod(0o755)
        self.git("config", "core.hooksPath", str(hooks))
        self.bash = bash

    def git(self, *args: str, check: bool = True, **env: str) -> str:
        result = subprocess.run(
            ["git", *args], cwd=self.clone, capture_output=True, text=True, env={**GIT_ENV, **env}
        )
        if check:
            assert result.returncode == 0, f"git {args}: {result.stderr}"
        return result.stdout.strip()

    def write(self, files: dict[str, bytes | None]) -> None:
        for path, content in files.items():
            target = self.clone / path
            target.parent.mkdir(parents=True, exist_ok=True)
            if content is None:
                target.unlink()
            else:
                target.write_bytes(content)

    def commit(self, files: dict[str, bytes | None], msg: str = "roles: change") -> str:
        self.write(files)
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", msg)
        return self.git("rev-parse", "HEAD")

    def push(
        self, *refspecs: str, flags: tuple[str, ...] = (), **env: str
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "push", *flags, "origin", *refspecs],
            cwd=self.clone,
            capture_output=True,
            text=True,
            env={**GIT_ENV, **env},
        )

    def remote(self, branch: str) -> str:
        result = subprocess.run(
            [
                "git",
                "--git-dir",
                str(self.origin),
                "rev-parse",
                "--verify",
                "-q",
                f"refs/heads/{branch}",
            ],
            capture_output=True,
            text=True,
            env=GIT_ENV,
        )
        return result.stdout.strip()

    def refused(
        self, result: subprocess.CompletedProcess[str], rule: str, *, dev: str | None = None
    ) -> None:
        """Push exited non-zero, stderr names the rule, and the remote trunk is unchanged."""
        assert result.returncode != 0, result.stderr
        assert f"[{rule}]" in result.stderr, result.stderr
        assert "role-binding lane refused" in result.stderr
        assert self.remote("dev") == (dev if dev is not None else self.base)


@pytest.fixture(params=BASHES, ids=lambda b: b)
def bash(request: pytest.FixtureRequest) -> str:
    return request.param


@pytest.fixture
def s(bash: str, tmp_path: Path) -> Scratch:
    return Scratch(tmp_path, bash)


def value_only() -> dict[str, bytes | None]:
    return {
        AGENT_PATH: sub(b'IMPLEMENTER_MODEL="prov/impl"', b'IMPLEMENTER_MODEL="prov/impl2"'),
        CONTENT_PATH: sub(b'SLIDE_MODEL="prov/slide"', b'SLIDE_MODEL=""', CONTENT),
    }


# --- the admitted case ---


@pytest.mark.smoke
def test_value_only_push_to_dev_is_admitted_without_override(s: Scratch) -> None:
    s.commit({AGENT_PATH: sub(b'IMPLEMENTER_MODEL="prov/impl"', b'IMPLEMENTER_MODEL="prov/impl2"')})
    tip = s.commit(value_only(), "roles: more")
    result = s.push("HEAD:dev")
    assert result.returncode == 0, result.stderr
    assert s.remote("dev") == tip
    assert "role-binding lane" in result.stderr and "admitted" in result.stderr


# --- failure modes 1-3: what a commit may change -----------------------------------------------

LINE_CASES = {
    "add-key": (AGENT + b'EXTRA_MODEL="x"\n', "key-set"),
    "remove-key": (sub(b'IMPLEMENTER_EFFORT_HIGH="high"\n', b""), "key-set"),
    "rename-key-to-other-binding-key": (sub(b"IMPLEMENTER_MODEL=", b"IMPL_MODEL="), "key-set"),
    "rename-key-to-non-binding-key": (
        sub(b"IMPLEMENTER_MODEL=", b"IMPLEMENTER_MODELS="),
        "binding-lines",
    ),
    "binding-line-turned-into-comment": (
        sub(b'ORCHESTRATOR_MODEL="prov/orch"', b'#ORCHESTRATOR_MODEL="prov/orch"'),
        "binding-lines",
    ),
    "comment-line-turned-into-binding": (
        sub(b"# note: comment line", b'NOTE_MODEL="x"'),
        "binding-lines",
    ),
    "comment-edited": (sub(b"# note: comment line", b"# note: other comment"), "binding-lines"),
    "blank-line-removed": (sub(b"\n\nORCHESTRATOR", b"\nORCHESTRATOR"), "key-set"),
    "blank-line-added": (sub(b"\n\nORCHESTRATOR", b"\n\n\nORCHESTRATOR"), "key-set"),
    "blank-line-becomes-whitespace": (
        sub(b"\n\nORCHESTRATOR", b"\n \nORCHESTRATOR"),
        "binding-lines",
    ),
    "line-order-swapped": (
        sub(
            b'ORCHESTRATOR_RUNTIME="pi"\nORCHESTRATOR_MODEL="prov/orch"\n',
            b'ORCHESTRATOR_MODEL="prov/orch"\nORCHESTRATOR_RUNTIME="pi"\n',
        ),
        "key-set",
    ),
    "crlf": (AGENT.replace(b"\n", b"\r\n"), "format"),
    "one-cr-in-a-value": (sub(b'"prov/impl"', b'"prov/impl\r"'), "format"),
    "trailing-newline-removed": (AGENT.rstrip(b"\n"), "format"),
    "dollar-in-value": (sub(b'"prov/impl"', b'"prov/$HOME"'), "value-chars"),
    "command-substitution": (sub(b'"prov/impl"', b'"$(touch pwned)"'), "value-chars"),
    "backtick-in-value": (sub(b'"prov/impl"', b'"prov/`id`"'), "value-chars"),
    "backslash-in-value": (sub(b'"prov/impl"', b'"prov/\\x"'), "value-chars"),
    "nul-byte": (sub(b'"prov/impl"', b'"prov/im\x00pl"'), "nul-byte"),
    "single-quoted-value": (sub(b'"prov/impl"', b"'prov/impl'"), "binding-lines"),
    "unquoted-value": (sub(b'"prov/impl"', b"prov/impl"), "binding-lines"),
    "command-after-value": (sub(b'"prov/impl"', b'"prov/impl"; touch pwned'), "binding-lines"),
    "trailing-comment-after-value": (sub(b'"prov/impl"', b'"prov/impl" # why'), "binding-lines"),
    "embedded-double-quote": (sub(b'"prov/impl"', b'"a"b"'), "binding-lines"),
    "lowercase-suffix-not-in-lane": (
        sub(b"IMPLEMENTER_MODEL=", b"IMPLEMENTER_Model="),
        "binding-lines",
    ),
}


@pytest.mark.smoke
@pytest.mark.parametrize("name", LINE_CASES)
def test_agent_roles_conf_edit_outside_value_only_is_refused(s: Scratch, name: str) -> None:
    content, rule = LINE_CASES[name]
    s.commit({AGENT_PATH: content})
    s.refused(s.push("HEAD:dev"), rule)
    assert not (s.clone / "pwned").exists()


@pytest.mark.smoke
def test_content_roles_conf_is_held_to_the_same_rules(s: Scratch) -> None:
    s.commit({CONTENT_PATH: sub(b'SLIDE_MODEL="prov/slide"', b'SLIDE_MODEL="$X"', CONTENT)})
    s.refused(s.push("HEAD:dev"), "value-chars")


@pytest.mark.smoke
def test_mode_change_alone_is_refused(s: Scratch) -> None:
    (s.clone / AGENT_PATH).chmod(0o755)
    s.git("add", "-A")
    s.git("commit", "-q", "-m", "roles: chmod")
    s.refused(s.push("HEAD:dev"), "file-mode")


@pytest.mark.smoke
def test_replacing_the_file_by_a_symlink_is_refused(s: Scratch) -> None:
    (s.clone / AGENT_PATH).unlink()
    (s.clone / AGENT_PATH).symlink_to("../app.txt")
    s.git("add", "-A")
    s.git("commit", "-q", "-m", "roles: symlink")
    s.refused(s.push("HEAD:dev"), "file-mode")


# --- failure mode 4: which paths a commit may touch ---


@pytest.mark.smoke
def test_a_path_outside_the_lane_list_is_refused_even_next_to_a_value_change(s: Scratch) -> None:
    s.commit({**value_only(), "app.txt": b"changed\n"})
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_only_an_outside_path_is_refused(s: Scratch) -> None:
    s.commit({"app.txt": b"changed\n"})
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_a_lookalike_path_is_refused(s: Scratch) -> None:
    s.commit({"config/agent-roles.conf.bak": AGENT})
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_deleting_a_lane_file_is_refused(s: Scratch) -> None:
    s.commit({CONTENT_PATH: None})
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_renaming_a_lane_file_is_refused(s: Scratch) -> None:
    s.git("mv", CONTENT_PATH, "config/renamed.conf")
    s.git("commit", "-q", "-m", "roles: rename")
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_copying_a_lane_file_is_refused(s: Scratch) -> None:
    s.commit({"config/copy.conf": AGENT, **value_only()})
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_adding_a_lane_file_that_the_base_lacks_is_refused(bash: str, tmp_path: Path) -> None:
    s = Scratch(tmp_path, bash)
    s.commit({CONTENT_PATH: None}, "drop content roles")
    s.git("push", "-q", "origin", "HEAD:refs/heads/other", ALLOW_DIRECT_PUSH="1")
    s.git("push", "-q", "-f", "origin", "HEAD:refs/heads/dev", ALLOW_DIRECT_PUSH="1")
    dev = s.remote("dev")
    s.commit({CONTENT_PATH: CONTENT}, "roles: add content roles")
    s.refused(s.push("HEAD:dev"), "lane-paths", dev=dev)


# --- failure mode 5: the whole range is checked, fast-forward only -------------------------------


@pytest.mark.smoke
def test_a_bad_commit_hidden_below_a_clean_tip_is_refused(s: Scratch) -> None:
    s.commit({AGENT_PATH: sub(b'"prov/impl"', b'"$(touch pwned)"')}, "roles: bad")
    s.commit({AGENT_PATH: AGENT}, "roles: revert")  # net diff against dev is empty of changes
    s.commit(value_only(), "roles: tip is clean")
    s.refused(s.push("HEAD:dev"), "value-chars")


@pytest.mark.smoke
def test_a_bad_commit_in_the_middle_is_refused(s: Scratch) -> None:
    s.commit({AGENT_PATH: sub(b'"prov/impl"', b'"prov/impl2"')})
    s.commit({"app.txt": b"x\n"}, "feature slipped in")
    s.commit({AGENT_PATH: sub(b'"prov/impl"', b'"prov/impl3"')})
    s.refused(s.push("HEAD:dev"), "lane-paths")


@pytest.mark.smoke
def test_a_push_that_is_not_a_fast_forward_of_dev_is_refused(s: Scratch) -> None:
    s.git("checkout", "-q", "-b", "other")
    s.commit({"app.txt": b"other\n"}, "someone else")
    s.git("push", "-q", "origin", "HEAD:dev", ALLOW_DIRECT_PUSH="1")
    dev = s.remote("dev")
    s.git("checkout", "-q", "work")
    s.commit(value_only())
    s.refused(s.push("HEAD:dev", flags=("-f",)), "fast-forward-only", dev=dev)


@pytest.mark.smoke
def test_a_merge_commit_in_the_range_is_refused(s: Scratch) -> None:
    s.git("checkout", "-q", "-b", "side")
    s.commit({AGENT_PATH: sub(b'"prov/impl"', b'"prov/impl2"')})
    s.git("checkout", "-q", "work")
    s.commit(
        {AGENT_PATH: sub(b'ORCHESTRATOR_MODEL="prov/orch"', b'ORCHESTRATOR_MODEL="prov/orch2"')}
    )
    s.git("merge", "-q", "--no-ff", "-m", "merge side", "side")
    s.refused(s.push("HEAD:dev"), "no-merge-commits")


# --- failure mode 6: only the trunk ---


@pytest.mark.smoke
def test_a_value_only_push_to_main_is_refused_while_dev_exists(s: Scratch) -> None:
    s.commit(value_only())
    result = s.push("HEAD:main")
    s.refused(result, "trunk-only")
    assert s.remote("main") == s.base


@pytest.mark.smoke
def test_a_value_only_push_to_a_release_branch_is_refused(s: Scratch) -> None:
    s.commit(value_only())
    result = s.push("HEAD:release/v9")
    assert result.returncode != 0
    assert "refusing to push directly to 'release/v9'" in result.stderr
    assert s.remote("release/v9") == s.base


@pytest.mark.smoke
def test_without_a_dev_branch_main_is_the_trunk(bash: str, tmp_path: Path) -> None:
    s = Scratch(tmp_path, bash, remote_branches=("main",))
    tip = s.commit(value_only())
    result = s.push("HEAD:main")
    assert result.returncode == 0, result.stderr
    assert s.remote("main") == tip


@pytest.mark.smoke
def test_a_branch_ending_in_dev_does_not_make_dev_the_trunk(bash: str, tmp_path: Path) -> None:
    s = Scratch(tmp_path, bash, remote_branches=("main", "feature/dev"))
    tip = s.commit(value_only())
    result = s.push("HEAD:main")
    assert result.returncode == 0, result.stderr
    assert s.remote("main") == tip


@pytest.mark.smoke
def test_an_unreachable_remote_fails_closed_never_main_by_accident(s: Scratch) -> None:
    tip = s.commit(value_only())
    for ref in ("main", "dev"):
        stdin = f"refs/heads/work {tip} refs/heads/{ref} {s.base}\n"
        result = subprocess.run(
            [s.bash, str(HOOK), str(s.tmp / "no-such-remote.git"), "unused-url"],
            cwd=s.clone,
            input=stdin,
            capture_output=True,
            text=True,
            env=GIT_ENV,
        )
        assert result.returncode == 1, result.stderr
        assert "[trunk-only]" in result.stderr, result.stderr


# --- failure modes 7 and 8: one existing ref ---


@pytest.mark.smoke
def test_creating_the_trunk_is_refused(bash: str, tmp_path: Path) -> None:
    s = Scratch(tmp_path, bash, remote_branches=("seed",))
    s.commit(value_only())
    result = s.push("HEAD:main")
    assert result.returncode != 0
    assert "[existing-ref-only]" in result.stderr, result.stderr
    assert s.remote("main") == ""


@pytest.mark.smoke
def test_deleting_the_trunk_is_refused(s: Scratch) -> None:
    result = s.push(":dev")
    s.refused(result, "existing-ref-only")


@pytest.mark.smoke
@pytest.mark.parametrize("other", ["main", "feature"])
def test_a_second_ref_makes_the_whole_push_refused(s: Scratch, other: str) -> None:
    s.commit(value_only())
    result = s.push("HEAD:dev", f"HEAD:{other}")
    s.refused(result, "single-ref")
    assert s.remote(other) == (s.base if other == "main" else "")


# --- failure mode 9: optional signature check ---


@pytest.mark.smoke
def test_unsigned_commit_is_refused_with_the_switch_on_and_admitted_with_it_off(s: Scratch) -> None:
    tip = s.commit(value_only())
    s.git("config", "roles.requireSignedCommits", "true")
    s.refused(s.push("HEAD:dev"), "signed-commits")
    s.git("config", "roles.requireSignedCommits", "false")
    result = s.push("HEAD:dev")
    assert result.returncode == 0, result.stderr
    assert s.remote("dev") == tip


@pytest.mark.smoke
def test_an_invalid_switch_value_fails_closed(s: Scratch) -> None:
    s.commit(value_only())
    s.git("config", "roles.requireSignedCommits", "maybe")
    s.refused(s.push("HEAD:dev"), "signed-commits")


@pytest.mark.smoke
@pytest.mark.skipif(shutil.which("ssh-keygen") is None, reason="needs ssh-keygen for ssh signing")
def test_a_signed_commit_is_admitted_with_the_switch_on(s: Scratch) -> None:
    key = s.tmp / "key"
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)], check=True)
    (s.tmp / "signers").write_text(f"t@example.com {(s.tmp / 'key.pub').read_text()}")
    for k, v in (
        ("gpg.format", "ssh"),
        ("user.signingkey", str(key)),
        ("gpg.ssh.allowedSignersFile", str(s.tmp / "signers")),
        ("roles.requireSignedCommits", "true"),
    ):
        s.git("config", k, v)
    s.write(value_only())
    s.git("add", "-A")
    s.git("commit", "-q", "-S", "-m", "roles: signed")
    tip = s.git("rev-parse", "HEAD")
    result = s.push("HEAD:dev")
    assert result.returncode == 0, result.stderr
    assert s.remote("dev") == tip


# --- everything that is not a lane push keeps today's behaviour ---


@pytest.mark.smoke
def test_a_code_push_to_dev_is_refused_without_override_and_passes_with_it(s: Scratch) -> None:
    tip = s.commit({"app.txt": b"feature\n"}, "feat: code")
    result = s.push("HEAD:dev")
    assert result.returncode != 0
    assert "refusing to push directly to 'dev'" in result.stderr
    assert s.remote("dev") == s.base
    result = s.push("HEAD:dev", ALLOW_DIRECT_PUSH="1")
    assert result.returncode == 0, result.stderr
    assert s.remote("dev") == tip


@pytest.mark.smoke
def test_a_push_to_an_unprotected_branch_is_untouched(s: Scratch) -> None:
    tip = s.commit({"app.txt": b"feature\n"}, "feat: code")
    result = s.push("HEAD:refs/heads/feat/x")
    assert result.returncode == 0, result.stderr
    assert s.remote("feat/x") == tip
    assert "role-binding lane" not in result.stderr
