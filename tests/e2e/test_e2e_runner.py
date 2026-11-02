"""E2E: a copy of scripts/e2e.sh in a scratch repo must fail the run when a piped suite fails."""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_failing_piped_suite_fails_the_run(tmp_path: Path) -> None:
    script = re.sub(
        r"(# >>> E2E SUITES.*?>>>\n).*?(# <<< E2E SUITES)",
        lambda m: f'{m[1]}SUITES=("false | cat")\nINPUTS=()\n{m[2]}',
        (ROOT / "scripts" / "e2e.sh").read_text(),
        flags=re.S,
    )
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "e2e.sh").write_text(script)
    git = ["git", "-c", "user.name=t", "-c", "user.email=t@t"]
    subprocess.run([*git[:1], "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run([*git, "commit", "-q", "--allow-empty", "-m", "x"], cwd=tmp_path, check=True)

    result = subprocess.run(
        ["bash", "scripts/e2e.sh", "--full"], cwd=tmp_path, capture_output=True, text=True
    )

    assert result.returncode != 0, result.stdout
    manifests = list((tmp_path / "artifacts").rglob("manifest.json"))
    assert len(manifests) == 1
    assert json.loads(manifests[0].read_text())["commands"][0]["exit_code"] != 0
