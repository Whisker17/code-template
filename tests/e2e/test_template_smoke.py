"""Smoke E2E: the skeleton entrypoint and the real dispatcher run end to end.

No model CLI or credential is used. The dispatcher runs against fake runtime executables on an
isolated PATH, so a real `pi`/`claude`/`codex` can never be reached; the test asserts the fakes
were never invoked.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DISPATCH = ROOT / "scripts" / "agent-dispatch.sh"
BASH = shutil.which("bash") or "/bin/bash"
ROLES = ("ORCHESTRATOR", "IMPLEMENTER", "REVIEWER")

FAKE_RUNTIME = """#!/bin/sh
echo "$0 $*" >> "$FAKE_LOG/calls"
"""


@pytest.mark.smoke
def test_entrypoint_dry_run() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "main.py"), "--dry-run"], capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.smoke
def test_dispatch_probe_reports_every_role_ok_without_calling_a_runtime(tmp_path: Path) -> None:
    fakebin = tmp_path / "bin"
    fakebin.mkdir()
    dirname = shutil.which("dirname")
    assert dirname
    (fakebin / "dirname").symlink_to(dirname)
    for runtime in ("claude", "codex", "pi"):
        fake = fakebin / runtime
        fake.write_text(FAKE_RUNTIME)
        fake.chmod(0o755)
    log = tmp_path / "log"
    log.mkdir()

    runtimes = {"ORCHESTRATOR": "pi", "IMPLEMENTER": "claude", "REVIEWER": "codex"}
    conf = tmp_path / "roles.conf"
    conf.write_text(
        "".join(
            f'{role}_RUNTIME="{runtimes[role]}"\n{role}_MODEL="fake-model"\n'
            f'{role}_EFFORT_MEDIUM="medium"\n{role}_EFFORT_HIGH="high"\n'
            for role in ROLES
        )
    )
    env = {"PATH": str(fakebin), "FAKE_LOG": str(log), "AGENT_ROLES_CONF": str(conf)}

    result = subprocess.run(
        [BASH, str(DISPATCH), "--probe"], env=env, capture_output=True, text=True
    )

    assert result.returncode == 0, result.stdout + result.stderr
    ok_lines = [line.split()[1] for line in result.stdout.splitlines() if line.startswith("ok ")]
    assert ok_lines == list(ROLES), result.stdout
    assert "UNUSABLE" not in result.stdout
    assert not (log / "calls").exists(), "probe must not invoke any runtime"
