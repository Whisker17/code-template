"""Smoke E2E: scripts/issue-audit.sh, the read-only audit that every open issue has one home.

Written first, from the issue's `## Failure modes`: every way an issue can be mis-homed has its own
fixture, and the audit must list it as `#<n> <reason>` and exit 1; a clean fixture exits 0 with no
output; a `gh` failure or unreadable JSON exits 2, never "clean".

findings (exit 1): no home; two or more homes (governance + milestone, backlog + prefix,
  backlog + governance, topic + version); prefix without milestone; milestone without prefix; prefix
  version != milestone version (three- and four-segment); a work issue (version, governance,
  backlog) without exactly one state label; `ready-for-agent` with `needs-design`.
exempt from the state label: `orchestration` issues and the project-defined non-code home `topic`.
ignored: pull requests (the issues API lists them, with a `pull_request` key), closed issues.
errors (exit 2): `gh` exits non-zero (even after printing valid JSON), invalid JSON, a body that is
  not the `--paginate --slurp` shape (an array of page arrays), a usage error.

A fake `gh` prints a real `--paginate --slurp` body (one array of page arrays). Each failure fixture
runs with the bad issue on page 1 and on page 2, so every page must be read. Run under every
available bash (/bin/bash is 3.2 on macOS). No network, model CLI, credential or real `gh`.
"""

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from test_role_binding_lane import BASHES, GIT_ENV, ROOT

AUDIT_SH = ROOT / "scripts" / "issue-audit.sh"
FAKE_GH = """#!/bin/sh
echo "gh $*" >> "$FAKE_LOG/calls"
cat "$FAKE_GH_OUT"
exit "${FAKE_GH_RC:-0}"
"""

Issue = dict[str, Any]


def issue(
    number: int,
    title: str,
    labels: tuple[str, ...] = (),
    milestone: str | None = None,
    **extra: Any,
) -> Issue:
    """An issue as `GET /repos/o/r/issues` returns it: label and milestone objects."""
    return {
        "number": number,
        "title": title,
        "state": "open",
        "labels": [{"name": name} for name in labels],
        "milestone": None if milestone is None else {"title": milestone},
        **extra,
    }


def slurp(*pages: list[Issue]) -> str:
    """What `gh api --paginate --slurp` prints: one JSON array holding one array per page."""
    return json.dumps(list(pages), indent=2)


CLEAN_PAGE_1 = [
    issue(1, "[0.3.1] [Docs] version work", ("todo", "ready-for-agent"), "v0.3.1"),
    issue(2, "[0.3.0.1] [Fix] hotfix", ("in-progress", "hotfix"), "v0.3.0.1"),
    issue(3, "[Docs] governance", ("in-review", "governance")),
    issue(4, "[Chore] backlog", ("todo", "backlog")),
]
CLEAN_PAGE_2 = [
    issue(5, "Release 0.3.1 — orchestration", ("orchestration",), "v0.3.1"),
    issue(6, "Why is the sky blue", ("topic", "needs-triage")),
    issue(7, "[0.3.1] [UI] awaiting design", ("todo", "needs-design"), "v0.3.1"),
    issue(8, "[0.3.1] open PR, no labels", milestone=None, pull_request={"url": "u"}),
    issue(9, "closed, no home", state="closed"),
]

# name -> (the bad issue, a substring its finding line must contain)
FAILURE_MODES: dict[str, tuple[Issue, str]] = {
    "no-home": (issue(90, "[Docs] nowhere", ("todo",)), "no home"),
    "governance-and-milestone": (
        issue(90, "[Docs] both", ("todo", "governance"), "v0.3.1"),
        "multiple homes",
    ),
    "governance-and-version": (
        issue(90, "[0.3.1] both", ("todo", "governance"), "v0.3.1"),
        "multiple homes",
    ),
    "backlog-and-prefix": (
        issue(90, "[0.3.1] both", ("todo", "backlog")),
        "multiple homes",
    ),
    "backlog-and-governance": (
        issue(90, "[Docs] both", ("todo", "backlog", "governance")),
        "multiple homes",
    ),
    "topic-and-version": (
        issue(90, "[0.3.1] both", ("topic", "todo"), "v0.3.1"),
        "multiple homes",
    ),
    "orchestration-and-governance": (
        issue(90, "Release 0.3.1 — orchestration", ("orchestration", "governance"), "v0.3.1"),
        "multiple homes",
    ),
    "orchestration-without-milestone": (
        issue(90, "Release 0.3.1 — orchestration", ("orchestration",)),
        "no home",
    ),
    "orchestration-prefix-without-milestone": (
        issue(90, "[0.3.1] orchestration", ("orchestration",)),
        "prefix without milestone",
    ),
    "prefix-without-milestone": (
        issue(90, "[0.3.1] [Docs] x", ("todo",)),
        "prefix without milestone",
    ),
    "milestone-without-prefix": (
        issue(90, "[Docs] x", ("todo",), "v0.3.1"),
        "milestone without",
    ),
    "prefix-differs-from-milestone": (
        issue(90, "[0.3.1] [Docs] x", ("todo",), "v0.3.0"),
        "differs",
    ),
    "four-segment-prefix-three-segment-milestone": (
        issue(90, "[0.3.0.1] [Fix] x", ("todo", "hotfix"), "v0.3.0"),
        "differs",
    ),
    "malformed-milestone-title": (
        issue(90, "[0.3.1] [Docs] x", ("todo",), "0.3.1"),
        "differs",
    ),
    "version-issue-without-state": (
        issue(90, "[0.3.1] [Docs] x", ("ready-for-agent",), "v0.3.1"),
        "state label",
    ),
    "governance-without-state": (issue(90, "[Docs] x", ("governance",)), "state label"),
    "backlog-without-state": (issue(90, "[Docs] x", ("backlog",)), "state label"),
    "two-state-labels": (
        issue(90, "[0.3.1] [Docs] x", ("todo", "in-review"), "v0.3.1"),
        "state label",
    ),
    "ready-with-needs-design": (
        issue(90, "[0.3.1] [UI] x", ("todo", "ready-for-agent", "needs-design"), "v0.3.1"),
        "needs-design",
    ),
}


@pytest.fixture(params=BASHES, ids=lambda b: b)
def bash(request: pytest.FixtureRequest) -> str:
    return request.param


class Audit:
    """The script copied under a scratch tree, a fake `gh` first on PATH, a recorded call log."""

    def __init__(self, tmp: Path, bash: str):
        self.bash, self.tmp = bash, tmp
        (tmp / "scripts").mkdir()
        self.script = tmp / "scripts" / "issue-audit.sh"
        self.script.write_bytes(AUDIT_SH.read_bytes())
        fakebin = tmp / "fakebin"
        fakebin.mkdir()
        (fakebin / "gh").write_text(FAKE_GH)
        (fakebin / "gh").chmod(0o755)
        (tmp / "log").mkdir()
        self.env = {
            **GIT_ENV,
            "PATH": f"{fakebin}:{GIT_ENV['PATH']}",
            "FAKE_LOG": str(tmp / "log"),
            "FAKE_GH_OUT": str(tmp / "gh-out"),
        }
        self.gh_out(slurp(CLEAN_PAGE_1, CLEAN_PAGE_2))

    def gh_out(self, body: str) -> None:
        (self.tmp / "gh-out").write_text(body)

    def run(self, *args: str, gh_rc: int = 0) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [self.bash, str(self.script), *args],
            cwd=self.tmp,
            capture_output=True,
            text=True,
            env={**self.env, "FAKE_GH_RC": str(gh_rc)},
        )

    def audit(self, *, gh_rc: int = 0) -> subprocess.CompletedProcess[str]:
        return self.run("--repo", "o/r", gh_rc=gh_rc)

    def calls(self) -> list[str]:
        log = self.tmp / "log" / "calls"
        return log.read_text().splitlines() if log.exists() else []


@pytest.fixture
def a(bash: str, tmp_path: Path) -> Audit:
    return Audit(tmp_path, bash)


# --- clean ---------------------------------------------------------------------------------------


@pytest.mark.smoke
def test_clean_fixture_exits_0_with_no_output(a: Audit) -> None:
    result = a.audit()
    assert (result.returncode, result.stdout, result.stderr) == (0, "", "")


@pytest.mark.smoke
def test_audit_pages_through_the_issues_api_read_only(a: Audit) -> None:
    a.audit()
    [call] = a.calls()
    assert call.startswith("gh api --paginate --slurp ")
    assert "repos/o/r/issues?" in call and "state=open" in call and "per_page=100" in call
    assert not any(flag in call for flag in ("-X", "--method", "-f ", "-F ", "--input"))


@pytest.mark.smoke
def test_no_open_issues_is_clean(a: Audit) -> None:
    a.gh_out("[]")
    assert a.audit().returncode == 0
    a.gh_out("[[]]")
    assert a.audit().returncode == 0


# --- findings, on either page --------------------------------------------------------------------


@pytest.mark.smoke
@pytest.mark.parametrize("page", ["page-1", "page-2"])
@pytest.mark.parametrize("mode", sorted(FAILURE_MODES))
def test_each_failure_mode_is_listed_with_its_reason_and_exits_1(
    a: Audit, mode: str, page: str
) -> None:
    bad, reason = FAILURE_MODES[mode]
    if page == "page-1":
        pages = (CLEAN_PAGE_1 + [bad], CLEAN_PAGE_2)
    else:
        pages = (CLEAN_PAGE_1, CLEAN_PAGE_2 + [bad])
    a.gh_out(slurp(*pages))
    result = a.audit()
    assert result.returncode == 1, result.stdout + result.stderr
    lines = result.stdout.splitlines()
    assert lines, "no finding printed"
    assert all(line.startswith("#90 ") for line in lines), result.stdout
    assert any(reason in line for line in lines), result.stdout


@pytest.mark.smoke
def test_a_finding_only_on_page_2_is_reported(a: Audit) -> None:
    a.gh_out(slurp(CLEAN_PAGE_1, [issue(101, "[Docs] nowhere", ("todo",))]))
    result = a.audit()
    assert (result.returncode, result.stdout) == (1, "#101 no home\n")


@pytest.mark.smoke
def test_three_pages_are_all_read(a: Audit) -> None:
    a.gh_out(slurp(CLEAN_PAGE_1, CLEAN_PAGE_2, [issue(102, "[Docs] nowhere", ("todo",))]))
    assert a.audit().stdout == "#102 no home\n"


@pytest.mark.smoke
def test_findings_are_one_line_each_ordered_by_issue_number(a: Audit) -> None:
    a.gh_out(
        slurp(
            [issue(30, "[Docs] a", ("todo",))],
            [issue(10, "[Docs] b", ("todo",)), issue(20, "[0.3.1] c", ("todo",))],
        )
    )
    result = a.audit()
    assert result.returncode == 1
    assert result.stdout.splitlines() == [
        "#10 no home",
        "#20 version prefix without milestone",
        "#30 no home",
    ]


@pytest.mark.smoke
def test_one_issue_with_two_problems_gets_two_lines(a: Audit) -> None:
    a.gh_out(slurp([issue(7, "[0.3.1] x", ("ready-for-agent", "needs-design"), "v0.3.1")]))
    result = a.audit()
    assert result.returncode == 1
    assert len(result.stdout.splitlines()) == 2
    assert all(line.startswith("#7 ") for line in result.stdout.splitlines())


@pytest.mark.smoke
def test_a_needs_design_issue_without_a_draft_is_not_a_finding(a: Audit) -> None:
    # the gate is enforced at pickup by /implement and /orchestrate, so it cannot deadlock a release
    a.gh_out(slurp([issue(7, "[0.3.1] [UI] x", ("todo", "needs-design"), "v0.3.1")]))
    assert a.audit().returncode == 0


@pytest.mark.smoke
def test_pull_requests_and_closed_issues_are_ignored(a: Audit) -> None:
    a.gh_out(
        slurp(
            [
                issue(5, "no home", pull_request={"url": "u"}),
                issue(6, "no home", state="closed"),
            ]
        )
    )
    assert a.audit().returncode == 0


# --- exit 2: the tracker could not be read -------------------------------------------------------


@pytest.mark.smoke
def test_gh_failure_exits_2_even_after_printing_valid_json(a: Audit) -> None:
    result = a.audit(gh_rc=1)
    assert result.returncode == 2, result.stdout + result.stderr
    assert result.stdout == ""
    assert "issue-audit:" in result.stderr


@pytest.mark.smoke
@pytest.mark.parametrize(
    "body",
    [
        "",
        "not json",
        '[[{"number":1,',
        '{"message":"Not Found"}',
        '[{"number":1,"title":"t","labels":[],"milestone":null}]',  # --paginate without --slurp
        '[["not an issue"]]',
        '[[{"title":"no number","labels":[],"milestone":null}]]',
        '[[{"number":1,"title":"t","labels":"todo","milestone":null}]]',
        '[[{"number":1,"title":"t","labels":[],"milestone":"v0.3.1"}]]',
        "null",
    ],
    ids=[
        "empty",
        "not-json",
        "truncated",
        "api-error-object",
        "flat-array-without-slurp",
        "page-of-strings",
        "issue-without-number",
        "labels-not-a-list",
        "milestone-not-an-object",
        "null",
    ],
)
def test_invalid_or_unexpected_json_exits_2(a: Audit, body: str) -> None:
    a.gh_out(body)
    result = a.audit()
    assert result.returncode == 2, result.stdout + result.stderr
    assert result.stdout == ""


@pytest.mark.smoke
@pytest.mark.parametrize(
    "args",
    [
        [],
        ["--repo"],
        ["--repo", "no-slash"],
        ["--repo", "o/r", "extra"],
        ["extra", "--repo", "o/r"],
    ],
    ids=[
        "no-args",
        "repo-without-value",
        "repo-not-owner-slash-name",
        "extra-arg",
        "leading-arg",
    ],
)
def test_usage_errors_exit_2_without_calling_gh(a: Audit, args: list[str]) -> None:
    result = a.run(*args)
    assert result.returncode == 2, result.stdout + result.stderr
    assert a.calls() == []


# --- the documented rules the audit and the design gate rest on ----------------------------------

HOME_HEADINGS = ["Issue homes", "Issue home audit", "UI/UX design gate"]


@pytest.mark.smoke
@pytest.mark.parametrize("heading", HOME_HEADINGS)
@pytest.mark.parametrize("binding", ["linear", "github"])
def test_each_tracker_binding_documents_homes_audit_and_design_gate(
    binding: str, heading: str
) -> None:
    text = (ROOT / "docs" / "agents" / "trackers" / f"{binding}.md").read_text()
    assert f"\n## {heading}\n" in text


@pytest.mark.smoke
@pytest.mark.parametrize("skill", ["implement", "orchestrate"])
def test_skill_refuses_needs_design_and_an_unapproved_draft(skill: str) -> None:
    text = (ROOT / ".claude" / "skills" / skill / "SKILL.md").read_text()
    assert "`needs-design`" in text and "`## Design Draft`" in text and "`## Design`" in text


@pytest.mark.smoke
def test_agents_md_records_the_template_version() -> None:
    version = (ROOT / "TEMPLATE_VERSION").read_text().strip()
    agents = (ROOT / "AGENTS.md").read_text().splitlines()
    assert agents.count(f"Template version: {version}") == 1
