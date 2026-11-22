"""Smoke E2E: scripts/roles.sh (list | check | get | set) against a scratch primary clone.

`set` edits, commits and pushes to the trunk, so these cases were written first, from the
issue's `## Failure modes`. Every refusal must leave the working tree, the index, the local refs
and the remote untouched (a snapshot taken before and after must be equal); a push or commit
failure after the edit must roll back surgically, keeping an unrelated unstaged edit.

* set refuses: not in the primary clone, not on the trunk, index not empty, target conf with
  unstaged changes, HEAD ahead of / behind the remote trunk, unknown role or missing key, a
  candidate tuple that fails `check`, a forbidden character in a value, `--reason` missing, a
  no-op, an invalid `roles.requireSignedCommits`
* set rolls back: the remote rejects the push, or the commit fails (signing is required but cannot
  sign); the saved conf bytes come back, HEAD is `$ORIG`, other unstaged edits survive
* check: never invokes a model (a fake `pi` records every call); a model the runtime does not list,
  an unknown or missing runtime, an invalid effort, a half-declared fallback all exit 1
* an absent config/content-roles.conf is skipped silently by list, check and get

`set` pushes through the real WHI-2627 hook (core.hooksPath), without ALLOW_DIRECT_PUSH, so each
success also proves the lane admitted it. Real git against a scratch bare remote; fake `pi`,
`claude` and `codex` on an isolated PATH. No network, model CLI or credential is used.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest
from test_role_binding_lane import BASHES, GIT_ENV, HOOK

ROOT = Path(__file__).resolve().parents[2]
ROLES_SH = ROOT / "scripts" / "roles.sh"
RUNTIMES = ("pi", "claude", "codex")
TOOLS = "git awk sed grep diff mktemp tail wc tr cat rm cut head sort dirname basename".split()

AGENT = b"""# Code roles.
# note: a comment

ORCHESTRATOR_RUNTIME="pi"
ORCHESTRATOR_MODEL="prov/orch"
ORCHESTRATOR_EFFORT_MEDIUM="medium"
ORCHESTRATOR_EFFORT_HIGH="max"

IMPLEMENTER_RUNTIME="pi"
IMPLEMENTER_MODEL="prov/impl"
IMPLEMENTER_EFFORT_MEDIUM="medium"
IMPLEMENTER_EFFORT_HIGH="high"

REVIEWER_RUNTIME="pi"
REVIEWER_MODEL="mg/nest/rev"
REVIEWER_EFFORT_MEDIUM="medium"
REVIEWER_EFFORT_HIGH="high"

REVIEWER_FALLBACK_RUNTIME=""
REVIEWER_FALLBACK_MODEL=""
REVIEWER_FALLBACK_EFFORT_MEDIUM=""
REVIEWER_FALLBACK_EFFORT_HIGH=""
"""
CONTENT = b"""# Content roles.
DECK_WRITER_RUNTIME="pi"
DECK_WRITER_MODEL="prov/impl"
DECK_WRITER_EFFORT="high"

DECK_REVIEWER_RUNTIME="pi"
DECK_REVIEWER_MODEL="mg/nest/rev"
DECK_REVIEWER_EFFORT="high"
"""
# Real `pi --list-models` format: a header row, then whitespace-aligned columns.
MODELS = b"""provider  model             context  max-out  thinking  images
prov      impl              1M       128K     yes       yes
prov      impl2             1M       128K     yes       yes
prov      orch              1M       128K     yes       yes
prov      rev               1M       128K     yes       yes
mg        nest/rev          1M       128K     yes       yes
magpie    solo/model-x      1M       128K     yes       yes
"""
FAKE_RUNTIME = """#!/bin/sh
echo "${0##*/} $*" >> "$FAKE_LOG/calls"
if [ "${0##*/}" = pi ] && [ "$1" = --list-models ]; then cat "$FAKE_MODELS"; fi
"""
AGENT_PATH = "config/agent-roles.conf"
CONTENT_PATH = "config/content-roles.conf"


def sub(old: str, new: str, blob: bytes = AGENT) -> bytes:
    assert old.encode() in blob, old
    return blob.replace(old.encode(), new.encode(), 1)


def isolated_path(fakebin: Path, tools: Path) -> str:
    """fakebin first, then the system PATH minus every directory that has a real runtime, plus
    symlinks for any tool the filtered PATH lost: the real pi/claude/codex are never reachable."""
    kept = [
        d
        for d in os.environ["PATH"].split(os.pathsep)
        if d and not any((Path(d) / r).exists() for r in RUNTIMES)
    ]
    tools.mkdir()
    for tool in TOOLS:
        if not shutil.which(tool, path=os.pathsep.join(kept)):
            found = shutil.which(tool)
            assert found, tool
            (tools / tool).symlink_to(found)
    return os.pathsep.join([str(fakebin), *kept, str(tools)])


class Roles:
    """Bare `origin` (main, dev), the primary clone on `dev` with the real hook, fake runtimes."""

    def __init__(self, tmp: Path, bash: str, content: bool = True):
        self.tmp, self.bash = tmp, bash
        self.origin, self.clone = tmp / "origin.git", tmp / "clone"
        fakebin = tmp / "fakebin"
        fakebin.mkdir()
        for runtime in RUNTIMES:
            (fakebin / runtime).write_text(FAKE_RUNTIME)
            (fakebin / runtime).chmod(0o755)
        self.fakebin = fakebin
        (tmp / "log").mkdir()
        (tmp / "models").write_bytes(MODELS)
        self.env = {
            **GIT_ENV,
            "PATH": isolated_path(fakebin, tmp / "tools"),
            "FAKE_LOG": str(tmp / "log"),
            "FAKE_MODELS": str(tmp / "models"),
        }
        subprocess.run(
            ["git", "init", "-q", "--bare", "-b", "main", str(self.origin)],
            check=True,
            env=GIT_ENV,
        )
        subprocess.run(
            ["git", "clone", "-q", str(self.origin), str(self.clone)],
            check=True,
            capture_output=True,
            env=GIT_ENV,
        )
        self.git("checkout", "-q", "-b", "dev")
        files = {AGENT_PATH: AGENT, "app.txt": b"app\n", "other.txt": b"other\n"}
        if content:
            files[CONTENT_PATH] = CONTENT
        (self.clone / "scripts").mkdir()
        shutil.copy(ROLES_SH, self.clone / "scripts" / "roles.sh")
        self.write(files)
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "base")
        for branch in ("main", "dev"):
            self.git("push", "-q", "origin", f"HEAD:refs/heads/{branch}")
        hooks = tmp / "hooks"
        hooks.mkdir()
        (hooks / "pre-push").write_text(f'#!/bin/sh\nexec "{bash}" "{HOOK}" "$@"\n')
        (hooks / "pre-push").chmod(0o755)
        self.git("config", "core.hooksPath", str(hooks))
        self.base = self.git("rev-parse", "HEAD")

    def git(self, *args: str, cwd: Path | None = None, check: bool = True, **env: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd or self.clone,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**self.env, **env},
        )
        if check:
            assert result.returncode == 0, f"git {args}: {result.stderr}"
        return result.stdout.strip()

    def write(self, files: dict[str, bytes]) -> None:
        for path, content in files.items():
            (self.clone / path).parent.mkdir(exist_ok=True)
            (self.clone / path).write_bytes(content)

    def run(
        self, *args: str, script: Path | None = None, **env: str
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [self.bash, str(script or self.clone / "scripts" / "roles.sh"), *args],
            cwd=script.parent.parent if script else self.clone,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**self.env, **env},
        )

    def calls(self) -> list[str]:
        log = self.tmp / "log" / "calls"
        return log.read_text().splitlines() if log.exists() else []

    def remote(self, branch: str = "dev") -> str:
        return self.git("--git-dir", str(self.origin), "rev-parse", f"refs/heads/{branch}")

    def snapshot(self, *clones: Path) -> dict[str, object]:
        """Everything a refused `set` must leave alone, in every clone given, and the remote."""
        snap: dict[str, object] = {
            "remote": self.git("--git-dir", str(self.origin), "for-each-ref"),
            "worktrees": self.git("worktree", "list", "--porcelain"),
        }
        for clone in clones or (self.clone,):
            snap[str(clone)] = {
                "status": self.git("status", "--porcelain", "-uall", cwd=clone),
                "diff": self.git("diff", cwd=clone),
                "cached": self.git("diff", "--cached", cwd=clone),
                "refs": self.git("for-each-ref", cwd=clone),
                "head": self.git("rev-parse", "HEAD", cwd=clone),
                "files": {
                    p: (clone / p).read_bytes()
                    for p in (AGENT_PATH, CONTENT_PATH, "app.txt", "other.txt")
                    if (clone / p).exists()
                },
            }
        return snap

    def refuse(
        self, *args: str, why: str, clones: tuple[Path, ...] = ()
    ) -> subprocess.CompletedProcess[str]:
        before = self.snapshot(*clones)
        result = self.run("set", *args)
        assert result.returncode != 0, result.stdout + result.stderr
        assert why in result.stderr, result.stderr
        assert self.snapshot(*clones) == before
        assert not [c for c in self.calls() if c != "pi --list-models"], "set invoked a model"
        return result

    def pushed_commit(self, parent: str) -> tuple[str, str]:
        """Assert exactly one commit on the remote trunk since `parent`; return (sha, message)."""
        assert self.git("rev-list", "--count", f"{parent}..{self.remote()}") == "1"
        assert self.git("rev-parse", "HEAD") == self.remote()
        return self.remote(), self.git("log", "-1", "--format=%B")


@pytest.fixture(params=BASHES, ids=lambda b: b)
def bash(request: pytest.FixtureRequest) -> str:
    return request.param


@pytest.fixture
def r(bash: str, tmp_path: Path) -> Roles:
    return Roles(tmp_path, bash)


# --- set: success ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_set_one_model_is_one_commit_on_the_remote_trunk_admitted_by_the_hook(r: Roles) -> None:
    result = r.run("set", "IMPLEMENTER", "--model", "prov/impl2", "--reason", "fix a/b & c")
    assert result.returncode == 0, result.stderr
    assert "role-binding lane" in result.stderr and "admitted" in result.stderr, result.stderr
    sha, message = r.pushed_commit(r.base)
    assert message.strip() == "roles: IMPLEMENTER_MODEL prov/impl → prov/impl2 (fix a/b & c)"
    assert (
        r.git("show", f"{sha}:{AGENT_PATH}") == sub('"prov/impl"', '"prov/impl2"').decode().strip()
    )
    assert r.git("diff", "--name-only", r.base, sha) == AGENT_PATH
    assert r.git("status", "--porcelain", "-uall") == ""


@pytest.mark.smoke
def test_set_several_keys_is_still_one_commit_and_changes_only_those_lines(r: Roles) -> None:
    result = r.run(
        "set",
        "REVIEWER",
        "--runtime",
        "claude",
        "--model",
        "mg/nest/rev",
        "--effort-medium",
        "low",
        "--effort-high",
        "xhigh",
        "--reason",
        "swap",
    )
    assert result.returncode == 0, result.stderr
    assert "cannot list models" in result.stdout + result.stderr
    sha, message = r.pushed_commit(r.base)
    assert message.strip() == (
        "roles: REVIEWER_RUNTIME pi → claude, REVIEWER_EFFORT_MEDIUM medium → low,"
        " REVIEWER_EFFORT_HIGH high → xhigh (swap)"
    )
    want = sub('REVIEWER_RUNTIME="pi"', 'REVIEWER_RUNTIME="claude"')
    want = sub('REVIEWER_EFFORT_MEDIUM="medium"', 'REVIEWER_EFFORT_MEDIUM="low"', want)
    want = sub('REVIEWER_EFFORT_HIGH="high"', 'REVIEWER_EFFORT_HIGH="xhigh"', want)
    assert (r.clone / AGENT_PATH).read_bytes() == want
    assert r.git("show", f"{sha}:{AGENT_PATH}") == want.decode().strip()
    assert [c for c in r.calls() if not c.startswith("pi --list")] == []


@pytest.mark.smoke
def test_set_a_content_role_leaves_a_dirty_other_conf_alone(r: Roles) -> None:
    dirty = AGENT + b"# local note\n"
    r.write({AGENT_PATH: dirty})
    result = r.run(
        "set", "DECK_WRITER", "--model", "prov/impl2", "--effort", "low", "--reason", "w"
    )
    assert result.returncode == 0, result.stderr
    _, message = r.pushed_commit(r.base)
    assert message.strip() == (
        "roles: DECK_WRITER_MODEL prov/impl → prov/impl2, DECK_WRITER_EFFORT high → low (w)"
    )
    assert r.git("diff", "--name-only", r.base, "HEAD") == CONTENT_PATH
    assert (r.clone / AGENT_PATH).read_bytes() == dirty  # still an unstaged edit
    assert r.git("status", "--porcelain") == f"M {AGENT_PATH}"  # git() strips the leading space


@pytest.mark.smoke
def test_set_can_declare_the_fallback_in_one_commit(r: Roles) -> None:
    result = r.run(
        "set",
        "REVIEWER_FALLBACK",
        "--runtime",
        "pi",
        "--model",
        "prov/rev",
        "--effort-medium",
        "medium",
        "--effort-high",
        "high",
        "--reason",
        "declare",
    )
    assert result.returncode == 0, result.stderr
    r.pushed_commit(r.base)
    assert r.git("diff", "--numstat", r.base, "HEAD") == f"4\t4\t{AGENT_PATH}"


@pytest.mark.smoke
@pytest.mark.skipif(shutil.which("ssh-keygen") is None, reason="needs ssh-keygen for ssh signing")
def test_set_signs_the_commit_only_when_the_lane_requires_it(r: Roles) -> None:
    key = r.tmp / "key"
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)], check=True)
    (r.tmp / "signers").write_text(f"t@example.com {(r.tmp / 'key.pub').read_text()}")
    for k, v in (
        ("gpg.format", "ssh"),
        ("user.signingkey", str(key)),
        ("gpg.ssh.allowedSignersFile", str(r.tmp / "signers")),
    ):
        r.git("config", k, v)
    assert r.run("set", "IMPLEMENTER", "--model", "prov/impl2", "--reason", "a").returncode == 0
    assert r.git("log", "-1", "--format=%G?") == "N"
    r.git("config", "roles.requireSignedCommits", "true")
    result = r.run("set", "IMPLEMENTER", "--model", "prov/orch", "--reason", "b")
    assert result.returncode == 0, result.stderr
    assert r.git("log", "-1", "--format=%G?") == "G"
    assert r.git("rev-parse", "HEAD") == r.remote()


# --- set: refusals leave everything unchanged -------------------------------------------------


@pytest.mark.smoke
def test_set_refuses_outside_the_primary_clone(r: Roles) -> None:
    r.git("checkout", "-q", "-b", "other")
    linked = r.tmp / "linked"
    r.git("worktree", "add", "-q", str(linked), "dev")
    before = r.snapshot(r.clone, linked)
    result = r.run(
        "set",
        "IMPLEMENTER",
        "--model",
        "prov/impl2",
        "--reason",
        "x",
        script=linked / "scripts" / "roles.sh",
    )
    assert result.returncode != 0 and "not the primary clone" in result.stderr, result.stderr
    assert r.snapshot(r.clone, linked) == before


@pytest.mark.smoke
@pytest.mark.parametrize("detach", [False, True], ids=["other-branch", "detached"])
def test_set_refuses_when_not_on_the_trunk(r: Roles, detach: bool) -> None:
    r.git("checkout", "-q", *(["--detach"] if detach else ["-b", "feature"]))
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="not on the trunk")


@pytest.mark.smoke
def test_set_refuses_when_the_trunk_cannot_be_determined(r: Roles) -> None:
    r.git("remote", "set-url", "origin", str(r.tmp / "no-such-remote.git"))
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="trunk")


@pytest.mark.smoke
def test_set_refuses_with_a_staged_change(r: Roles) -> None:
    (r.clone / "app.txt").write_bytes(b"staged\n")
    r.git("add", "app.txt")
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="index is not empty")


@pytest.mark.smoke
def test_set_refuses_when_the_target_conf_has_unstaged_changes(r: Roles) -> None:
    r.write({AGENT_PATH: AGENT + b"# local note\n"})
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="unstaged changes")


@pytest.mark.smoke
def test_set_refuses_when_head_is_ahead_of_the_remote_trunk(r: Roles) -> None:
    (r.clone / "app.txt").write_bytes(b"local commit\n")
    r.git("commit", "-q", "-am", "local")
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="is not at origin/dev")


@pytest.mark.smoke
def test_set_refuses_when_head_is_behind_the_remote_trunk(r: Roles) -> None:
    other = r.tmp / "other"
    r.git("clone", "-q", str(r.origin), str(other), cwd=r.tmp)
    (other / "app.txt").write_bytes(b"someone else\n")
    r.git("commit", "-q", "-am", "theirs", cwd=other)
    r.git("push", "-q", "origin", "HEAD:refs/heads/dev", cwd=other, ALLOW_DIRECT_PUSH="1")
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="is not at origin/dev")


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("args", "why"),
    [
        (["NOSUCH", "--model", "prov/impl2"], "unknown role"),
        (["IMPLEMENTER", "--effort", "high"], "--effort-medium"),  # code roles have two efforts
        (["DECK_WRITER", "--effort-high", "high"], "--effort"),  # content roles have one
        (["IMPLEMENTER", "--effort", "high", "--effort-high", "low"], "either --effort"),
        (["IMPLEMENTER"], "nothing to change"),
        (["IMPLEMENTER", "--model", "prov/impl"], "nothing to change"),
    ],
)
def test_set_refuses_an_unknown_role_or_a_wrong_effort_flag(
    r: Roles, args: list[str], why: str
) -> None:
    r.refuse(*args, "--reason", "x", why=why)


@pytest.mark.smoke
def test_set_refuses_a_key_the_conf_does_not_have(r: Roles) -> None:
    r.write({AGENT_PATH: AGENT.replace(b'IMPLEMENTER_EFFORT_HIGH="high"\n', b"")})
    r.git("commit", "-q", "-am", "drop a key")
    r.git("push", "-q", "origin", "HEAD:refs/heads/dev", ALLOW_DIRECT_PUSH="1")
    r.refuse("IMPLEMENTER", "--effort-high", "low", "--reason", "x", why="IMPLEMENTER_EFFORT_HIGH")


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("args", "why"),
    [
        (["--model", "prov/gone"], "not listed"),
        (["--model", "model"], "not listed"),  # the header row's word is not a model
        (["--model", "provider/model"], "not listed"),
        (["--runtime", "foo"], "unknown runtime"),
        (["--runtime", "codex", "--model", "m"], "not valid for codex"),  # ORCHESTRATOR's `max`
        (["--effort-high", "ultra"], "not valid for pi"),
        (["--model", "prov/impl2:high"], "embeds a thinking level"),
        (["--model", "-x"], "plain token"),
        (["--model", ""], "model is unset"),
        (["--effort-medium", "", "--effort-high", ""], "no effort"),
    ],
)
def test_set_refuses_a_candidate_that_fails_check(r: Roles, args: list[str], why: str) -> None:
    role = "ORCHESTRATOR" if "codex" in args else "IMPLEMENTER"
    r.refuse(role, *args, "--reason", "x", why=why)


@pytest.mark.smoke
def test_set_refuses_a_runtime_that_is_not_on_path(r: Roles) -> None:
    (r.fakebin / "codex").unlink()
    r.refuse(
        "IMPLEMENTER", "--runtime", "codex", "--model", "m", "--reason", "x", why="not on PATH"
    )


@pytest.mark.smoke
@pytest.mark.parametrize("bad", ["a$b", "a`b", "a\\b", 'a"b', "a b", "a\tb", "a\nb"])
def test_set_refuses_a_forbidden_character_in_a_value(r: Roles, bad: str) -> None:
    r.refuse("IMPLEMENTER", "--model", bad, "--reason", "x", why="forbidden character")
    r.refuse("IMPLEMENTER", "--effort-high", bad, "--reason", "x", why="forbidden character")


@pytest.mark.smoke
@pytest.mark.parametrize("reason", [None, "", "  ", "two\nlines"])
def test_set_refuses_a_missing_or_unusable_reason(r: Roles, reason: str | None) -> None:
    extra = [] if reason is None else ["--reason", reason]
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", *extra, why="--reason")


@pytest.mark.smoke
def test_set_refuses_an_invalid_signing_switch(r: Roles) -> None:
    r.git("config", "roles.requireSignedCommits", "maybe")
    r.refuse("IMPLEMENTER", "--model", "prov/impl2", "--reason", "x", why="not a boolean")


# --- set: rollback after the edit ------------------------------------------------------------


@pytest.mark.smoke
def test_set_rolls_back_surgically_when_the_remote_rejects_the_push(r: Roles) -> None:
    pre_receive = r.origin / "hooks" / "pre-receive"
    pre_receive.write_text("#!/bin/sh\necho rejected by test >&2\nexit 1\n")
    pre_receive.chmod(0o755)
    dirty_agent = AGENT + b"# local note\n"
    r.write({AGENT_PATH: dirty_agent})
    (r.clone / "other.txt").write_bytes(b"unrelated unstaged edit\n")
    before = r.snapshot()
    result = r.run("set", "DECK_WRITER", "--model", "prov/impl2", "--reason", "x")
    assert result.returncode != 0 and "rolled back" in result.stderr, result.stderr
    assert "rejected by test" in result.stderr
    assert r.snapshot() == before
    assert r.git("rev-parse", "HEAD") == r.base == r.remote()
    assert (r.clone / "other.txt").read_bytes() == b"unrelated unstaged edit\n"
    assert (r.clone / AGENT_PATH).read_bytes() == dirty_agent
    assert (r.clone / CONTENT_PATH).read_bytes() == CONTENT
    assert r.git("diff", "--cached", "--name-only") == ""


@pytest.mark.smoke
def test_set_rolls_back_when_the_target_conf_was_clean_and_the_push_is_rejected(r: Roles) -> None:
    pre_receive = r.origin / "hooks" / "pre-receive"
    pre_receive.write_text("#!/bin/sh\nexit 1\n")
    pre_receive.chmod(0o755)
    (r.clone / "other.txt").write_bytes(b"unrelated unstaged edit\n")
    before = r.snapshot()
    result = r.run("set", "IMPLEMENTER", "--model", "prov/impl2", "--reason", "x")
    assert result.returncode != 0 and "rolled back" in result.stderr, result.stderr
    assert r.snapshot() == before
    assert r.git("status", "--porcelain", "-uall") == "M other.txt"  # git() strips the space
    assert (r.clone / AGENT_PATH).read_bytes() == AGENT


@pytest.mark.smoke
def test_set_rolls_back_when_the_commit_cannot_be_signed(r: Roles) -> None:
    r.git("config", "roles.requireSignedCommits", "true")
    r.git("config", "gpg.program", "false")
    (r.clone / "other.txt").write_bytes(b"unrelated unstaged edit\n")
    before = r.snapshot()
    result = r.run("set", "IMPLEMENTER", "--model", "prov/impl2", "--reason", "x")
    assert result.returncode != 0 and "rolled back" in result.stderr, result.stderr
    assert r.snapshot() == before


# --- check --------------------------------------------------------------------------------------


@pytest.mark.smoke
def test_check_passes_and_only_asks_pi_for_its_model_list(r: Roles) -> None:
    result = r.run("check")
    assert result.returncode == 0, result.stdout + result.stderr
    for line in (
        "ok        ORCHESTRATOR -> pi prov/orch (effort: medium max)",
        "ok        IMPLEMENTER -> pi prov/impl (effort: medium high)",
        "unset     REVIEWER_FALLBACK",
        "ok        DECK_WRITER -> pi prov/impl (effort: high)",
        "ok        DECK_REVIEWER -> pi mg/nest/rev (effort: high)",
    ):
        assert line in result.stdout, result.stdout
    assert set(r.calls()) == {"pi --list-models"}


@pytest.mark.smoke
def test_check_exits_1_for_a_model_pi_does_not_list_and_records_no_model_call(r: Roles) -> None:
    r.write({AGENT_PATH: sub('"prov/impl"', '"prov/gone"')})
    result = r.run("check", "IMPLEMENTER")
    assert result.returncode == 1, result.stdout + result.stderr
    assert "UNUSABLE  IMPLEMENTER" in result.stdout and "not listed" in result.stdout
    assert r.calls() and set(r.calls()) == {"pi --list-models"}


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("model", "listed"),
    [
        ("prov/impl", True),  # <col1>/<col2>
        ("impl", True),  # col2 exactly
        ("mg/nest/rev", True),  # <col1>/<col2> where col2 has a slash
        ("nest/rev", True),  # col2 exactly, with a slash
        ("solo/model-x", True),
        ("prov/imp", False),
        ("prov/impl2x", False),
        ("mg/nest", False),
        ("rev", True),  # col2 exactly, no slash
        ("nest", False),
        ("model", False),  # header row
        ("provider/model", False),  # header row
    ],
)
def test_check_matches_a_pi_model_by_column_two_or_provider_slash_column_two(
    r: Roles, model: str, listed: bool
) -> None:
    r.write({AGENT_PATH: sub('"prov/impl"', f'"{model}"')})
    result = r.run("check", "IMPLEMENTER")
    assert (result.returncode == 0) is listed, result.stdout + result.stderr
    assert ("not listed" in result.stdout) is (not listed)


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("old", "new", "why"),
    [
        ('IMPLEMENTER_RUNTIME="pi"', 'IMPLEMENTER_RUNTIME="foo"', "unknown runtime 'foo'"),
        ('IMPLEMENTER_RUNTIME="pi"', 'IMPLEMENTER_RUNTIME=""', "runtime is unset"),
        ('IMPLEMENTER_MODEL="prov/impl"', 'IMPLEMENTER_MODEL=""', "model is unset"),
        ('IMPLEMENTER_MODEL="prov/impl"', 'IMPLEMENTER_MODEL="prov/impl:high"', "embeds"),
        ('IMPLEMENTER_EFFORT_HIGH="high"', 'IMPLEMENTER_EFFORT_HIGH="ultra"', "'ultra'"),
        ('ORCHESTRATOR_RUNTIME="pi"', 'ORCHESTRATOR_RUNTIME="codex"', "not valid for codex"),
        ('IMPLEMENTER_RUNTIME="pi"', 'IMPLEMENTER_RUNTIME="claude"', "cannot list models"),
        (
            'REVIEWER_MODEL="mg/nest/rev"',
            'REVIEWER_MODEL="mg/nest/rev"\nREVIEWER_CMD="x"',
            "REVIEWER_CMD",
        ),
    ],
)
def test_check_reports_each_way_a_role_is_unusable(r: Roles, old: str, new: str, why: str) -> None:
    r.write({AGENT_PATH: sub(old, new)})
    result = r.run("check")
    assert (result.returncode == 0) is (why == "cannot list models"), result.stdout  # warning only
    assert why in result.stdout, result.stdout
    assert [c for c in r.calls() if c != "pi --list-models"] == []


@pytest.mark.smoke
def test_check_fails_when_the_runtime_binary_is_missing(r: Roles) -> None:
    (r.fakebin / "pi").unlink()
    result = r.run("check", "IMPLEMENTER")
    assert result.returncode == 1 and "'pi' is not on PATH" in result.stdout, result.stdout


@pytest.mark.smoke
def test_check_fails_when_pi_cannot_list_its_models(r: Roles) -> None:
    (r.fakebin / "pi").write_text("#!/bin/sh\nexit 4\n")
    result = r.run("check", "IMPLEMENTER")
    assert result.returncode == 1 and "pi --list-models" in result.stdout, result.stdout


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("medium", "high", "ok"),
    [("medium", "", True), ("", "high", True), ("", "", False), ("medium", "bogus", False)],
)
def test_check_lets_a_code_role_leave_one_effort_empty_but_not_both(
    r: Roles, medium: str, high: str, ok: bool
) -> None:
    conf = sub('IMPLEMENTER_EFFORT_MEDIUM="medium"', f'IMPLEMENTER_EFFORT_MEDIUM="{medium}"')
    r.write(
        {
            AGENT_PATH: sub(
                'IMPLEMENTER_EFFORT_HIGH="high"', f'IMPLEMENTER_EFFORT_HIGH="{high}"', conf
            )
        }
    )
    assert (r.run("check", "IMPLEMENTER").returncode == 0) is ok


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("key", "value"), [("MODEL", "prov/rev"), ("RUNTIME", "pi"), ("EFFORT_HIGH", "high")]
)
def test_check_fails_a_half_declared_fallback(r: Roles, key: str, value: str) -> None:
    r.write({AGENT_PATH: sub(f'REVIEWER_FALLBACK_{key}=""', f'REVIEWER_FALLBACK_{key}="{value}"')})
    result = r.run("check", "REVIEWER_FALLBACK")
    assert result.returncode == 1 and "UNUSABLE  REVIEWER_FALLBACK" in result.stdout, result.stdout


@pytest.mark.smoke
def test_check_never_calls_claude_or_codex_and_warns_they_cannot_list(r: Roles) -> None:
    conf = sub('REVIEWER_RUNTIME="pi"', 'REVIEWER_RUNTIME="claude"')
    r.write({AGENT_PATH: sub('IMPLEMENTER_RUNTIME="pi"', 'IMPLEMENTER_RUNTIME="codex"', conf)})
    result = r.run("check", "IMPLEMENTER", "REVIEWER")
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.count("cannot list models") == 2
    assert r.calls() == []


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("runtime", "effort", "ok"),
    [
        ("pi", "off", True),
        ("codex", "high", True),
        ("codex", "max", False),
        ("claude", "max", True),
    ],
)
def test_check_validates_a_content_role_with_its_single_effort(
    r: Roles, runtime: str, effort: str, ok: bool
) -> None:
    conf = sub('DECK_WRITER_RUNTIME="pi"', f'DECK_WRITER_RUNTIME="{runtime}"', CONTENT)
    r.write(
        {CONTENT_PATH: sub('DECK_WRITER_EFFORT="high"', f'DECK_WRITER_EFFORT="{effort}"', conf)}
    )
    assert (r.run("check", "DECK_WRITER").returncode == 0) is ok


@pytest.mark.smoke
def test_check_an_unknown_role_is_a_usage_error(r: Roles) -> None:
    assert r.run("check", "NOSUCH").returncode == 2
    assert r.run("bogus").returncode == 2
    assert r.run().returncode == 2


# --- get and list -------------------------------------------------------------------------------


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("args", "out"),
    [
        (["IMPLEMENTER", "--effort", "high"], "prov/impl:high"),
        (["IMPLEMENTER", "--effort", "medium"], "prov/impl:medium"),
        (["ORCHESTRATOR", "--effort", "high"], "prov/orch:max"),
        (["DECK_WRITER"], "prov/impl:high"),
        (["DECK_REVIEWER"], "mg/nest/rev:high"),
    ],
)
def test_get_prints_model_colon_effort_for_pi(r: Roles, args: list[str], out: str) -> None:
    result = r.run("get", *args)
    assert result.returncode == 0 and result.stdout == out + "\n", result.stderr


@pytest.mark.smoke
def test_get_prints_runtime_model_effort_for_claude_and_codex(r: Roles) -> None:
    conf = sub('REVIEWER_RUNTIME="pi"', 'REVIEWER_RUNTIME="claude"')
    conf = sub('REVIEWER_EFFORT_HIGH="high"', 'REVIEWER_EFFORT_HIGH="xhigh"', conf)
    r.write(
        {
            AGENT_PATH: conf,
            CONTENT_PATH: sub('DECK_WRITER_RUNTIME="pi"', 'DECK_WRITER_RUNTIME="codex"', CONTENT),
        }
    )
    assert r.run("get", "REVIEWER", "--effort", "high").stdout == "claude mg/nest/rev xhigh\n"
    assert r.run("get", "DECK_WRITER").stdout == "codex prov/impl high\n"
    assert r.calls() == []


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("args", "code"),
    [
        (["IMPLEMENTER"], 2),  # a code role needs --effort
        (["IMPLEMENTER", "--effort", "low"], 2),
        (["DECK_WRITER", "--effort", "high"], 2),  # a content role has its own effort
        (["NOSUCH"], 2),
        ([], 2),
        (["REVIEWER_FALLBACK", "--effort", "high"], 3),  # undeclared: fails closed, prints nothing
    ],
)
def test_get_refuses_what_it_cannot_answer_exactly(r: Roles, args: list[str], code: int) -> None:
    result = r.run("get", *args)
    assert result.returncode == code and result.stdout == "", result.stderr


@pytest.mark.smoke
def test_get_fails_closed_for_an_unusable_binding(r: Roles) -> None:
    r.write({AGENT_PATH: sub('IMPLEMENTER_EFFORT_HIGH="high"', 'IMPLEMENTER_EFFORT_HIGH=""')})
    result = r.run("get", "IMPLEMENTER", "--effort", "high")
    assert result.returncode == 3 and result.stdout == ""


@pytest.mark.smoke
def test_list_shows_a_code_table_and_a_content_table(r: Roles) -> None:
    result = r.run("list")
    assert result.returncode == 0, result.stderr
    out = result.stdout
    assert out.index("Code roles") < out.index("Content roles")
    code, content = out.split("Content roles")
    assert "IMPLEMENTER" in code and "prov/impl" in code and "MEDIUM" in code and "HIGH" in code
    assert "DECK_WRITER" in content and "DECK_REVIEWER" in content and "EFFORT" in content
    assert r.calls() == []


@pytest.mark.smoke
def test_an_absent_content_file_is_skipped_silently(bash: str, tmp_path: Path) -> None:
    r = Roles(tmp_path, bash, content=False)
    listing = r.run("list")
    assert listing.returncode == 0 and "Content roles" not in listing.stdout, listing.stderr
    assert "IMPLEMENTER" in listing.stdout and "DECK_" not in listing.stdout
    checked = r.run("check")
    assert checked.returncode == 0 and "DECK_" not in checked.stdout, checked.stdout
    assert checked.stderr == "" and listing.stderr == ""
    assert r.run("get", "DECK_WRITER").returncode == 2
    assert r.run("check", "DECK_WRITER").returncode == 2


@pytest.mark.smoke
def test_a_linked_worktree_reads_the_primary_clones_binding(r: Roles) -> None:
    linked = r.tmp / "linked"
    r.git("worktree", "add", "-q", "-b", "feat", str(linked), "dev")
    ok = r.run("set", "IMPLEMENTER", "--model", "prov/impl2", "--reason", "x")
    assert ok.returncode == 0, ok.stderr
    assert (linked / AGENT_PATH).read_bytes() == AGENT  # the branch still has the old value
    got = r.run("get", "IMPLEMENTER", "--effort", "high", script=linked / "scripts" / "roles.sh")
    assert got.stdout == "prov/impl2:high\n", got.stderr
