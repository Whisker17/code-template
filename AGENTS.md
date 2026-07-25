# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, etc.) working in this
repository. `CLAUDE.md` is a symlink to this file — edit here only.

## What this is

{{PROJECT_DESCRIPTION}}

The full PRD — requirements, architecture, milestones, rejected alternatives, open
risks — lives in `docs/DESIGN.md`. Read it before making any design or architectural
decision; do not re-derive parameters or decisions that are already validated there.

## Status

<!-- Keep this section current: what has landed, what is architected-for but NOT
implemented yet. Update it the moment reality changes instead of leaving stale
placeholders. Agents must not assume a module exists until its issue lands. -->

Freshly bootstrapped from the project template. `docs/DESIGN.md` is not yet written —
produce it via `/grill-me` + `/to-spec` before implementing anything.

## Build, test, run

<!-- Replace with the real commands once the stack is confirmed. Default Python/uv
stack: -->

```bash
uv sync                                  # install deps (creates .venv)
uv run pytest                            # unit tests
uv run pytest tests/test_smoke.py        # single test file
uv run ruff check .                      # lint
uv run mypy                              # type check
uv run python main.py                    # entrypoint
```

## Runtime configuration

Secrets live in `.env` at the repo root (`.env.example` is the checked-in
template), loaded at startup — a missing required var must fail fast with a clear
error. **Never commit `.env`.** Non-secret runtime parameters (thresholds, feature
flags, tunables) live in `config/` as validated, typed config — not hardcoded, not in
`.env`. See `config/README.md` for the convention.

## Architecture

Module layout is fixed by `docs/DESIGN.md` §4.2. Keep this section a short mirror of
that section — one bullet per top-level module, its single responsibility, and the
load-bearing interfaces other modules may depend on.

<!-- Fill in as DESIGN.md §4.2 lands, e.g.:
- **`<module>/`** — responsibility; depends only on <interface>.
-->

## Git workflow (mandatory)

**One issue = one git worktree off latest `origin/dev` = one PR into `dev`.**
Do **not** implement issues in the primary clone working tree.

1. `git fetch` + create worktree/branch from `origin/dev`
   (`fix/{{ISSUE_PREFIX_LOWER}}-NNN-topic` or `feat/{{ISSUE_PREFIX_LOWER}}-NNN-topic`).
2. Implement only that issue; tracker state → **`In Progress`**.
3. `gh pr create --base dev` (title/body include `{{ISSUE_PREFIX}}-NNN`); tracker →
   **`In Review`**. Any review finding you intentionally leave unfixed goes in
   `docs/DEFERRED_ISSUES.md` as part of this PR — see that file for the format.
4. A PR whose implementation went through `/implement`'s full three-round review loop
   (plus the escalation pass, when round 3 left findings open) is **pre-authorized to
   self-squash-merge** once it reads MERGEABLE/CLEAN and tests + lint pass — no separate
   human approval. **Exceptions that stop at `In Review` for a human:** changes touching
   **{{HIGH_RISK_PATHS}}**, and `release/*` → `main` promotions. PRs that skipped the
   review loop also stop at `In Review`. After merging, run the **post-merge cleanup**
   below.

### Post-merge cleanup (mandatory, in order)

Drive these from the **primary clone**; never commit to `dev` directly.

0. **If the PR is CONFLICTING** (`dev` advanced since you branched): inside the feature
   worktree, `git merge origin/dev`, resolve, rerun the affected tests, and `git push`.
   The PR must read **MERGEABLE / CLEAN** before you merge.
1. **Squash-merge + drop the remote branch:** `gh pr merge <N> --squash --delete-branch`.
2. **Remove the worktree:** `git worktree remove <worktree-path>` then
   `git worktree prune`.
3. **Delete the local branch:** `git branch -D fix/{{ISSUE_PREFIX_LOWER}}-NNN-topic`
   (this fails while the worktree still holds the branch — do step 2 first).
4. **Fast-forward local `dev`:** `git fetch origin --prune` then
   `git merge --ff-only origin/dev` (must fast-forward — do not create commits on
   `dev`).
5. **Tracker → `Done`.**

Never open a PR with `dev` as head into `main` (the branch would be auto-deleted by
`delete_branch_on_merge`). Promote via temporary `release/*` from `dev`. Full rules:
`docs/GIT_WORKFLOW.md`.

## Template feedback loop

This repo was bootstrapped from the shared project template
(`{{TEMPLATE_REPO_URL}}`). When work here surfaces an improvement that belongs to the
**template layer** — a workflow rule that bit us, a skills configuration fix, a doc
convention worth standardizing — tell the user explicitly so they can port it back to
the template repo (and its `CHANGELOG.md`). Project-specific learnings stay here;
process-level learnings flow back.

## Agent skills

### Issue tracker

Issues and PRDs live in **Linear** (project `{{LINEAR_PROJECT}}`, team
`{{LINEAR_TEAM}}`), accessed via the Linear MCP tools (through the `slim-tools`
gateway). External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical role names (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`) used verbatim as Linear labels. See
`docs/agents/triage-labels.md`.

### Domain docs

This repo's spec of record is `docs/DESIGN.md` (PRD: requirements, architecture,
milestones, rejected alternatives, open risks) plus `docs/adr/` for narrower decisions
made after v1 ships. See `docs/agents/domain.md`.
