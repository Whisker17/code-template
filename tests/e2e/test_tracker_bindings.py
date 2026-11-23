"""Smoke E2E: the Linear and GitHub tracker bindings stay equivalent and tracker-neutral.

`docs/agents/trackers/{linear,github}.md` define the same operations in one `## Operations`
table; SETUP copies the chosen one over `docs/agents/issue-tracker.md`, the only file skills and
shared docs name. Each assertion below is its own test. SETUP.md is executed, not re-implemented:
the tracker selection, the placeholder sweep and § A.2's copy loop are extracted from its fenced
bash blocks and run against scratch copies. No network, model CLI, credential or real `gh`.

Template-only: SETUP § 2 deletes `docs/agents/trackers/`, so in a bootstrapped project the whole
module skips itself (the one installed binding is covered by the tests that read
`docs/agents/issue-tracker.md`). WHI-2636: `test_smoke_is_green_after_setup_selection` runs the
whole smoke suite in a scratch copy after § 2 for each tracker; the adopt cases run the extracted
loop under `set -euo pipefail` and prove the placeholder sweep flags every unfilled marker.
"""

import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest
from test_role_binding_lane import GIT_ENV, ROOT

BASH = shutil.which("bash") or "/bin/bash"
TRACKERS = ROOT / "docs" / "agents" / "trackers"
LINEAR = TRACKERS / "linear.md"
GITHUB = TRACKERS / "github.md"
ISSUE_TRACKER = ROOT / "docs" / "agents" / "issue-tracker.md"
if not TRACKERS.is_dir():
    pytest.skip("template-only: SETUP § 2 deleted docs/agents/trackers/", allow_module_level=True)
OPERATIONS = [
    "Release entity",
    "Version signal",
    "Workflow states",
    "Dependencies",
    "Orchestration document",
    "Release → Released",
]
CROSS_REFERENCED_HEADINGS = [
    "Release ↔ version binding",
    "Issue lifecycle ↔ Git",
    "Publishing ticket sets",
    "Reading a release",
    "Release orchestration document",
]
# Built from parts so no marker literal sits in this file (SETUP's sweep reads *.py too).
LINEAR_MARKER = "{{" + "LINEAR_"
FILLED_MARKERS = [
    "PROJECT_NAME",
    "PROJECT_DESCRIPTION",
    "ISSUE_PREFIX",
    "ISSUE_PREFIX_LOWER",
    "GITHUB_REPO",
    "HIGH_RISK_PATHS",
    "RELEASE_SCRIPT_PATHS",
    "TEMPLATE_REPO_URL",
]
LINEAR_MARKERS = ["LINEAR_PROJECT", "LINEAR_TEAM"]
LINEAR_VALUES = {
    "PROJECT_NAME": "demo",
    "PROJECT_DESCRIPTION": "a demo",
    "LINEAR_PROJECT": "Demo",
    "LINEAR_TEAM": "DEM",
    "ISSUE_PREFIX": "DEM",
    "ISSUE_PREFIX_LOWER": "dem",
    "HIGH_RISK_PATHS": "payments",
    "RELEASE_SCRIPT_PATHS": "scripts/release.sh",
    "TEMPLATE_REPO_URL": "https://example.invalid/template",
}
GITHUB_VALUES = {
    "PROJECT_NAME": "demo",
    "PROJECT_DESCRIPTION": "a demo",
    "ISSUE_PREFIX": "GH",
    "ISSUE_PREFIX_LOWER": "gh",
    "GITHUB_REPO": "acme/demo",
    "HIGH_RISK_PATHS": "payments",
    "RELEASE_SCRIPT_PATHS": "scripts/release.sh",
    "TEMPLATE_REPO_URL": "https://example.invalid/template",
}


def tree_files(root: Path = ROOT) -> list[Path]:
    """Tracked files that exist, relative to root: an untracked stray never changes a result."""
    out = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root, capture_output=True, text=True, check=True,
    ).stdout
    return [Path(p) for p in out.split("\0") if p and (root / p).is_file()]


def copy_tree(dest: Path) -> Path:
    for rel in tree_files():
        (dest / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dest / rel)
    return dest


def setup_block(*needles: str) -> str:
    """The one fenced ```bash block of SETUP.md that contains every needle."""
    text = (ROOT / "SETUP.md").read_text()
    fenced = re.findall(r"```bash\n(.*?)```", text, re.S)
    blocks = [b for b in fenced if all(n in b for n in needles)]
    assert len(blocks) == 1, f"{needles}: {len(blocks)} SETUP.md bash blocks match"
    return blocks[0]


def run_bash(script: str, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [BASH, "-c", script], cwd=cwd, env={**os.environ, **env}, capture_output=True, text=True
    )


def operations_table(path: Path) -> list[list[str]]:
    """Rows (cells) of the `## Operations` table, header and separator dropped."""
    section = re.search(r"^## Operations\n(.*?)(?=^## |\Z)", path.read_text(), re.S | re.M)
    assert section, f"{path} has no `## Operations` section"
    rows = [
        [c.strip() for c in line.strip().strip("|").split("|")]
        for line in section.group(1).splitlines()
        if line.startswith("|")
    ]
    return rows[2:]


def headings(path: Path) -> list[str]:
    """`## ` headings with a trailing parenthetical (`(mandatory)`) dropped."""
    return [
        re.sub(r"\s*\([^)]*\)$", "", m)
        for m in re.findall(r"^## (.+)$", path.read_text(), re.M)
    ]


def fill_markers(root: Path, values: dict[str, str]) -> None:
    pattern = re.compile(r"\{\{(" + "|".join(values) + r")\}\}")
    for path in root.rglob("*"):
        sweepable = path.suffix in {".md", ".toml", ".yml", ".py"} and path.name != "SETUP.md"
        if path.is_file() and sweepable:
            path.write_text(pattern.sub(lambda m: values[m.group(1)], path.read_text()))


@pytest.mark.smoke
def test_operations_tables_have_identical_first_columns() -> None:
    linear = [row[0] for row in operations_table(LINEAR)]
    github = [row[0] for row in operations_table(GITHUB)]
    assert linear == github


@pytest.mark.smoke
def test_operations_tables_define_the_six_operations() -> None:
    assert [row[0] for row in operations_table(GITHUB)] == OPERATIONS


@pytest.mark.smoke
@pytest.mark.parametrize("binding", [LINEAR, GITHUB], ids=lambda p: p.stem)
def test_every_operation_row_has_a_value(binding: Path) -> None:
    assert all(len(row) == 2 and row[1] for row in operations_table(binding))


@pytest.mark.smoke
def test_skills_never_name_a_binding_file() -> None:
    hits = subprocess.run(
        ["grep", "-rn", "trackers/", ".claude/skills"], cwd=ROOT, capture_output=True, text=True
    )
    assert hits.returncode == 1 and hits.stdout == "", hits.stdout


@pytest.mark.smoke
def test_no_linear_placeholder_outside_the_linear_binding() -> None:
    allowed = {
        Path("docs/agents/trackers/linear.md"),
        Path("docs/agents/issue-tracker.md"),
        Path("SETUP.md"),  # the runbook that names and fills the markers
    }
    offenders = [
        str(rel)
        for rel in tree_files()
        if rel not in allowed and LINEAR_MARKER in (ROOT / rel).read_text(errors="ignore")
    ]
    assert offenders == []


@pytest.mark.smoke
def test_github_placeholder_lives_only_in_the_github_binding() -> None:
    marker = "{{" + "GITHUB_REPO}}"
    allowed = {Path("docs/agents/trackers/github.md"), Path("SETUP.md")}
    offenders = [
        str(rel)
        for rel in tree_files()
        if rel not in allowed and marker in (ROOT / rel).read_text(errors="ignore")
    ]
    assert offenders == []


@pytest.mark.smoke
@pytest.mark.parametrize("heading", CROSS_REFERENCED_HEADINGS)
@pytest.mark.parametrize("binding", [LINEAR, GITHUB], ids=lambda p: p.stem)
def test_cross_referenced_heading_exists_in_each_binding(binding: Path, heading: str) -> None:
    assert heading in headings(binding)


@pytest.mark.smoke
def test_template_issue_tracker_is_byte_identical_to_the_linear_binding() -> None:
    assert ISSUE_TRACKER.read_bytes() == LINEAR.read_bytes()


@pytest.fixture
def github_bootstrap(tmp_path: Path) -> Path:
    """A scratch copy after SETUP § 2's tracker selection for `github` and marker filling."""
    scratch = copy_tree(tmp_path / "bootstrap")
    selection = setup_block("rm -r docs/agents/trackers")
    done = run_bash(selection, scratch, {"TRACKER": "github"})
    assert done.returncode == 0, done.stderr
    fill_markers(scratch, GITHUB_VALUES)
    return scratch


@pytest.mark.smoke
def test_github_selection_installs_the_binding_and_deletes_trackers(github_bootstrap: Path) -> None:
    tracker = (github_bootstrap / "docs/agents/issue-tracker.md").read_text()
    assert tracker.startswith("# Issue tracker: GitHub Issues")
    assert "acme/demo" in tracker
    assert not (github_bootstrap / "docs/agents/trackers").exists()


@pytest.mark.smoke
def test_setup_placeholder_sweep_is_clean_after_github_selection(github_bootstrap: Path) -> None:
    sweep = run_bash(setup_block("grep -rnE", "--exclude=SETUP.md"), github_bootstrap, {})
    assert (sweep.returncode, sweep.stdout) == (1, ""), sweep.stdout


@pytest.mark.smoke
def test_setup_placeholder_sweep_names_the_github_marker(github_bootstrap: Path) -> None:
    stray = github_bootstrap / "docs" / "stray.md"
    stray.write_text("repo {{" + "GITHUB_REPO}}\n")
    sweep = run_bash(setup_block("grep -rnE", "--exclude=SETUP.md"), github_bootstrap, {})
    assert sweep.returncode == 0 and "stray.md" in sweep.stdout, sweep.stdout


class Adopt:
    """SETUP § A.2 run for real: a committed copy of the template, a scratch target repo.

    The copy loop and the marker fill run under `set -euo pipefail`; the sweep is the block's last
    command, run on its own because it signals "nothing found" with a non-zero exit (xargs: 123).
    """

    def __init__(self, tmp: Path, existing_tracker: str | None, tracker: str = "github"):
        tmp.mkdir()
        self.template = copy_tree(tmp / "template")
        for args in (["init", "-q"], ["add", "-A"], ["commit", "-qm", "t"]):
            subprocess.run(
                ["git", *args], cwd=self.template, env=GIT_ENV, check=True, capture_output=True
            )
        self.target = tmp / "target"
        (self.target / "docs/agents").mkdir(parents=True)
        subprocess.run(["git", "init", "-q"], cwd=self.target, env=GIT_ENV, check=True)
        if existing_tracker is not None:
            (self.target / "docs/agents/issue-tracker.md").write_text(existing_tracker)
        self.adopt_tmp = tmp / "adopt-tmp"
        self.adopt_tmp.mkdir()
        self.env = {
            "TEMPLATE": str(self.template),
            "TARGET": str(self.target),
            "ADOPT_TMP": str(self.adopt_tmp),
            "TRACKER": tracker,
            **(GITHUB_VALUES if tracker == "github" else LINEAR_VALUES),
        }
        copy_loop = setup_block("PROCESS_PATHS=")
        fill_loop, sweep = setup_block("export PROJECT_NAME", "xargs -0 grep -nE").split("tr '\\n'")
        self.sweep_script = "tr '\\n'" + sweep
        self.result = run_bash(
            "set -euo pipefail\n" + copy_loop + "\n" + fill_loop, self.target, self.env
        )
        assert self.result.returncode == 0, self.result.stdout + self.result.stderr

    def lines(self, name: str) -> list[str]:
        return (self.adopt_tmp / name).read_text().splitlines()

    def sweep(self) -> subprocess.CompletedProcess[str]:
        return run_bash(self.sweep_script, self.target, self.env)

    def leftover_markers(self) -> list[str]:
        """Bootstrap markers still in a copied file, found without SETUP's own sweep regex."""
        marker = re.compile(r"\{\{(" + "|".join(FILLED_MARKERS + LINEAR_MARKERS) + r")\}\}")
        return [
            f"{rel}: {m.group(0)}"
            for rel in self.lines("copied.txt")
            for m in marker.finditer((self.target / rel).read_text(errors="ignore"))
        ]


@pytest.fixture
def adopt_conflict(tmp_path: Path) -> Adopt:
    return Adopt(tmp_path / "conflict", existing_tracker="# the target's own tracker notes\n")


@pytest.fixture
def adopt_fresh(tmp_path: Path) -> Adopt:
    return Adopt(tmp_path / "fresh", existing_tracker=None)


@pytest.fixture
def adopt_linear(tmp_path: Path) -> Adopt:
    return Adopt(tmp_path / "linear", existing_tracker=None, tracker="linear")


@pytest.mark.smoke
def test_adopt_lists_a_differing_issue_tracker_in_conflicts(adopt_conflict: Adopt) -> None:
    assert "docs/agents/issue-tracker.md" in adopt_conflict.lines("conflicts.txt")
    assert "docs/agents/issue-tracker.md" not in adopt_conflict.lines("copied.txt")


@pytest.mark.smoke
def test_adopt_leaves_a_differing_issue_tracker_untouched(adopt_conflict: Adopt) -> None:
    kept = adopt_conflict.target / "docs/agents/issue-tracker.md"
    assert kept.read_text() == "# the target's own tracker notes\n"


@pytest.mark.smoke
def test_adopt_never_copies_the_trackers_directory(
    adopt_conflict: Adopt, adopt_fresh: Adopt, adopt_linear: Adopt
) -> None:
    for run in (adopt_conflict, adopt_fresh, adopt_linear):
        assert not (run.target / "docs/agents/trackers").exists()
        listed = run.lines("copied.txt") + run.lines("conflicts.txt")
        assert not any(line.startswith("docs/agents/trackers/") for line in listed)


@pytest.mark.smoke
def test_adopt_installs_the_chosen_binding_when_issue_tracker_is_absent(adopt_fresh: Adopt) -> None:
    installed = adopt_fresh.target / "docs/agents/issue-tracker.md"
    assert "docs/agents/issue-tracker.md" in adopt_fresh.lines("copied.txt")
    assert installed.read_text().startswith("# Issue tracker: GitHub Issues")
    assert "acme/demo" in installed.read_text()


@pytest.mark.smoke
def test_adopt_installs_the_linear_binding_when_tracker_is_linear(adopt_linear: Adopt) -> None:
    installed = adopt_linear.target / "docs/agents/issue-tracker.md"
    assert "docs/agents/issue-tracker.md" in adopt_linear.lines("copied.txt")
    assert installed.read_text().startswith("# Issue tracker: Linear")
    assert "Demo" in installed.read_text() and "acme/demo" not in installed.read_text()


@pytest.mark.smoke
@pytest.mark.parametrize("fixture", ["adopt_fresh", "adopt_linear"])
def test_adopt_marker_sweep_over_copied_files_is_clean(
    fixture: str, request: pytest.FixtureRequest
) -> None:
    run: Adopt = request.getfixturevalue(fixture)
    sweep = run.sweep()
    # xargs exits 123 when grep finds nothing; any hit would be printed.
    assert (sweep.returncode, sweep.stdout, sweep.stderr) == (123, "", ""), sweep.stdout
    assert run.leftover_markers() == []


@pytest.mark.smoke
def test_adopt_marker_sweep_flags_every_unfilled_marker(adopt_fresh: Adopt) -> None:
    """Negative case: a sweep that misses a marker (a regex edited down) lets it ship."""
    assert "docs/GIT_WORKFLOW.md" in adopt_fresh.lines("copied.txt")
    names = FILLED_MARKERS + LINEAR_MARKERS
    stray = adopt_fresh.target / "docs/GIT_WORKFLOW.md"
    stray.write_text(stray.read_text() + "".join(f"\nunfilled {{{{{m}}}}}\n" for m in names))
    sweep = adopt_fresh.sweep()
    assert sweep.returncode == 0, sweep.stderr
    assert [m for m in names if "{{" + m + "}}" not in sweep.stdout] == []


@pytest.mark.smoke
def test_tree_files_ignore_an_untracked_stray_file(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "tracked.md").write_text("tracked\n")
    for args in (["init", "-q"], ["add", "tracked.md"], ["commit", "-qm", "t"]):
        subprocess.run(["git", *args], cwd=repo, env=GIT_ENV, check=True, capture_output=True)
    before = tree_files(repo)
    (repo / "stray.md").write_text("{{" + "LINEAR_PROJECT}}\n")
    assert before == [Path("tracked.md")]
    assert tree_files(repo) == before


# `uv run python ...` becomes the interpreter running this test: no network, no project sync.
UV_SHIM = """#!/bin/sh
if [ "$1" = run ] && [ "$2" = python ]; then shift 2; exec "$E2E_PYTHON" "$@"; fi
echo "uv shim"
"""


@pytest.mark.smoke
@pytest.mark.parametrize(
    ("tracker", "values"), [("github", GITHUB_VALUES), ("linear", LINEAR_VALUES)]
)
def test_smoke_is_green_after_setup_selection(
    tracker: str, values: dict[str, str], tmp_path: Path
) -> None:
    """The bootstrapped project's smoke E2E passes ("the smoke test must pass", SETUP § 4)."""
    scratch = copy_tree(tmp_path / "bootstrap")
    done = run_bash(setup_block("rm -r docs/agents/trackers"), scratch, {"TRACKER": tracker})
    assert done.returncode == 0, done.stderr
    fill_markers(scratch, values)
    sweep = run_bash(setup_block("grep -rnE", "--exclude=SETUP.md"), scratch, {})
    assert (sweep.returncode, sweep.stdout) == (1, ""), sweep.stdout
    for args in (["init", "-q"], ["add", "-A"], ["commit", "-qm", "bootstrap"]):
        subprocess.run(["git", *args], cwd=scratch, env=GIT_ENV, check=True, capture_output=True)
    shim = tmp_path / "bin" / "uv"
    shim.parent.mkdir()
    shim.write_text(UV_SHIM)
    shim.chmod(shim.stat().st_mode | stat.S_IEXEC)
    env = {
        **os.environ,
        **GIT_ENV,
        "PATH": f"{shim.parent}{os.pathsep}{os.environ['PATH']}",
        "E2E_PYTHON": sys.executable,
    }

    result = subprocess.run(
        [BASH, "scripts/e2e.sh", "--smoke"], cwd=scratch, env=env, capture_output=True, text=True
    )

    assert result.returncode == 0, result.stdout[-3000:] + result.stderr
    (manifest_path,) = (scratch / "artifacts/e2e/smoke/local").glob("*/manifest.json")
    manifest = json.loads(manifest_path.read_text())
    tree = subprocess.run(
        ["git", "rev-parse", "HEAD^{tree}"], cwd=scratch, capture_output=True, text=True
    ).stdout.strip()
    assert [c["exit_code"] for c in manifest["commands"]] == [0]
    assert manifest["tree"] == tree
    assert "config/agent-roles.conf" in [i["path"] for i in manifest["inputs"]]
