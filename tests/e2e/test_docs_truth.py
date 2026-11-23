"""Smoke E2E: WHI-2635 -- docs that contradicted the scripts and hooks they describe.

Written before the doc fixes; each test failed on release/v0.3.1 at 066733d.
  R1-F3   the direct-push exceptions are FIVE (three ALLOW_DIRECT_PUSH=1 merges, the role-binding
          lane, the agent release cut), never "four"/"three".
  R1-F4   `parentId` in /to-tickets is only the Linear example; GitHub links native sub-issues.
  R1-F7   the bind-time check is `scripts/roles.sh check`, not the static `--probe`; every
          `gh issue` call in trackers/github.md carries `--repo`.
  R1-F17  the issue /to-spec prescribes for a pre-release GitHub project passes
          scripts/issue-audit.sh (a milestone-less `orchestration` issue is `no home`).
No network, model CLI, credential or real `gh`.
"""

import re
from pathlib import Path

import pytest
from test_issue_audit import Audit, issue, slurp
from test_role_binding_lane import BASHES, ROOT


def read(rel: str) -> str:
    return (ROOT / rel).read_text()


FIVE_PASSAGES = (
    ("AGENTS.md", "the only direct pushes are five:"),
    ("docs/GIT_WORKFLOW.md", "five direct pushes are the documented exceptions"),
    ("docs/GIT_WORKFLOW.md", "the only direct pushes are five:"),
)


@pytest.mark.smoke
def test_direct_push_exceptions_are_five_everywhere() -> None:
    stale = re.compile(
        r"four direct pushes|direct pushes are four|only direct pushes are the three",
        re.IGNORECASE,
    )
    for rel in ("AGENTS.md", "docs/GIT_WORKFLOW.md"):
        text = re.sub(r"\s+", " ", read(rel))
        assert not stale.search(text), rel
        assert "agent release cut" in text, rel
    # Each of the three passages is pinned on its own, so one reverted passage cannot hide.
    for rel, passage in FIVE_PASSAGES:
        assert passage in re.sub(r"\s+", " ", read(rel)).lower(), f"{rel}: {passage}"


@pytest.mark.smoke
def test_to_tickets_parent_id_is_only_the_linear_example() -> None:
    text = re.sub(r"\s+", " ", read(".claude/skills/to-tickets/SKILL.md"))
    for hit in re.finditer("parentId", text):
        assert "(Linear: " in text[max(0, hit.start() - 12) : hit.start()], hit.start()
    assert "native sub-issues is required" in read(".claude/skills/to-tickets/SKILL.md").replace(
        "\n", " "
    )


@pytest.mark.smoke
def test_runtime_names_roles_check_not_the_static_probe() -> None:
    text = read("docs/agents/runtime.md")
    assert "static `--probe`" not in text
    assert "scripts/roles.sh check" in text


@pytest.mark.smoke
def test_every_github_gh_issue_call_carries_repo() -> None:
    # After SETUP § 2 the bindings are gone and the installed one is issue-tracker.md.
    rel = "docs/agents/trackers/github.md"
    if not (ROOT / rel).exists():
        rel = "docs/agents/issue-tracker.md"
        if not read(rel).startswith("# Issue tracker: GitHub"):
            pytest.skip("the installed tracker is not GitHub")
    # Whole-file scan: several calls span lines inside one backticked span.
    for call in re.findall(r"`(gh issue [^`]*)`", read(rel), re.S):
        assert "--repo" in call, f"{rel}: {call}"


@pytest.mark.smoke
@pytest.mark.parametrize("bash", BASHES)
def test_to_spec_prescribes_a_governance_issue_the_audit_accepts(bash: str, tmp_path: Path) -> None:
    spec = read(".claude/skills/to-spec/SKILL.md").replace("\n", " ")
    assert "`governance`" in spec and "state label" in spec
    assert "issue labelled `orchestration`" not in spec
    a = Audit(tmp_path, bash)
    prescribed = issue(10, "[Docs] Design review", ("governance", "in-review"))
    a.gh_out(slurp([prescribed]))
    done = a.audit()
    assert (done.returncode, done.stdout) == (0, "")
    old_shape = issue(10, "Design review", ("orchestration",))
    a.gh_out(slurp([old_shape]))
    old = a.audit()
    assert old.returncode == 1 and "#10 no home" in old.stdout
