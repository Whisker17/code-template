---
name: implement
description: "Implement one tracker issue in its own worktree: ponytail, relevant checks, PR and handoff."
disable-model-invocation: true
---

Implement one issue (or the bounded work the user describes) end to end. You are the
`IMPLEMENTER` role (`docs/agents/runtime.md`).

## Start

1. If the user passed a ticket reference, fetch it via `docs/agents/issue-tracker.md` and
   state its title before starting. Resolve an ambiguous reference with the user. Read the
   whole issue, including comments, amendments and its `## Execution` section, the spec
   sections it cites, and only the other docs the task needs. If complexity or expected
   scope is missing, get it fixed before starting.
2. Resolve the base and create the worktree exactly as `docs/GIT_WORKFLOW.md`
   § Resolving the base branch says — fail closed, never a defaulted `dev`, never create
   `release/v*`. Assert the base, enable hooks in the worktree. The worktree lives at
   `../<repo>-wt/<issue-id>` (a verification worktree at `../<repo>-wt/<issue-id>-verify`).
3. Tracker → `In Progress` (standalone). Under `/orchestrate` the orchestrator owns the
   tracker; you report facts.

## Build and verify

- Apply `.claude/skills/ponytail/SKILL.md` while writing.
- Stay inside the issue's expected scope. If the work needs more, stop and report
  instead of widening it.
- Testing follows `AGENTS.md` § Testing. Write or extend E2E scenarios for the acceptance
  criteria (Given → When → observable Then) and have them leave an artifact. Never write
  unit tests after the code. Test a system in isolation only when the issue has a
  `## Failure modes` section: write those failure cases first, then the code.
- While working, run the relevant E2E scenarios and lint/type checks. Do not rerun the
  full E2E over and over.
- On the final HEAD, use the tiers of `docs/GIT_WORKFLOW.md` § 2 Implement:
  - the **required project checks** (CI, and what `AGENTS.md` marks for every merge)
    always;
  - the **relevant issue checks** always;
  - **smoke E2E** (`scripts/e2e.sh --smoke`) always;
  - **full E2E** (`scripts/e2e.sh --full`) for standalone, governance and hotfix work.
    Only an ordinary version or bootstrap issue under `/orchestrate` skips it; the
    release E2E covers it at the candidate;
  - **long-run acceptance** never, unless the owner scheduled it. Do not run it yourself.
- If the base advanced, update the branch and rerun the affected checks. An earlier
  HEAD's pass does not count.

## PR and handoff

1. Commit, `git push -u origin HEAD`, `gh pr create --base <resolved-base>`. The body
   (`.github/pull_request_template.md`) carries the issue id, the resolved base and its
   signals, the evidence (SHA, commands, real results, the smoke E2E output — or full E2E
   for standalone, governance and hotfix work — and artifact paths), the role/model/effort
   you ran as, and why any new dependency or significant abstraction is needed. Tracker →
   `In Review` (standalone).
2. Write a handoff with `/handoff`: its durable facts belong in the PR or issue.
3. **No worktree left behind** (`docs/GIT_WORKFLOW.md` § No worktree left behind). Before
   you finish, remove every worktree you created for helpers or verification (sub-agent
   worktrees, `<issue-id>-verify`), then run `scripts/wt-gc.sh` (dry run) and deal with what
   it reports for your work. Under `/orchestrate` your own issue worktree stays until the
   orchestrator has merged the PR and cleans it up; say so in the handoff. A worktree you
   keep on purpose is named, with path and reason, in the final reply.

## Merge

Authority comes only from `docs/GIT_WORKFLOW.md` § Merge authorization.

- **Under `/orchestrate`:** stop at PR + handoff. The orchestrator verifies and merges.
- **Standalone** (no release orchestration takes over), and governance and hotfix PRs: run
  one independent **Quick** review with `/code-review` (`REVIEWER`, effort `high`, real
  dispatches — not your own context). Its precondition is `scripts/e2e.sh --full` passed on
  the final head; it never needs a release artifact. Fix accepted blocking findings; a
  suggestion you consciously leave that is worth remembering goes in
  `docs/DEFERRED_ISSUES.md` with its reason. If you changed anything after the review, the
  reviewer checks the final commit before merge. Then, unless a human-gated row applies:
  PR MERGEABLE/CLEAN, checks green on the final HEAD, `gh pr merge <N> --squash
  --delete-branch`, post-merge cleanup and fan-out per `docs/GIT_WORKFLOW.md`, tracker →
  `Done` (the worktree and local branch are removed first: § Post-merge cleanup).
- **Human-gated** (high-risk paths, hotfix → `main`, `release/*` → `main`, finished
  `release/v*` → `dev`): stop at `In Review`.
- `REVIEWER` unavailable or a dispatch failed: follow `docs/agents/runtime.md` § Reviewer
  unavailable (the fallback is eligible only as it defines). Otherwise stay at `In Review`
  and say which role was missing. Never substitute a self-review.
