# code-template

A project template for process-standardized, agent-driven development. Every new
project starts from this skeleton and inherits the same workflow: **PRD-first specs,
Linear-tracked issues, worktree-per-issue git flow, and a vendored suite of engineering
skills** for Claude Code / Codex.

Extracted and generalized from `pm-arbitrage-bot`, where this process was battle-tested.

## How to use

1. Create a new repo from this template (GitHub "Use this template", or clone + re-init).
2. Open it in Claude Code and say: **"Read SETUP.md and execute it."**
   The agent interviews you (project name, Linear project, high-risk paths, stack,
   Docker), replaces every placeholder marker, wires up git/GitHub merge policy,
   verifies the skeleton, and deletes `SETUP.md`.
3. Produce the spec of record: `/grill-me <your idea>` → `/to-spec` fills
   `docs/DESIGN.md`.
4. Break it down: `/to-tickets` publishes blocked/blocking Linear issues.
5. Implement: `/implement` per issue — worktree off `dev`, three-round review loop,
   self-squash-merge on green (except {{HIGH_RISK_PATHS}} and releases).
6. Ship: cut `release/vX.Y.Z` from `dev` → PR into `main` (merge commit), tag, deploy
   **from the tag**. Production broken while `dev` holds unshippable work? Take the
   hotfix lane instead — `docs/GIT_WORKFLOW.md`.

## What's inside

| Layer | Contents |
|-------|----------|
| **Agent guidance** | `AGENTS.md` (canonical; `CLAUDE.md` is a symlink) |
| **Skills** (22, vendored from `mattpocock/skills`) | implement, code-review, handoff, tdd, diagnosing-bugs, prototype, wayfinder, grill-me, grill-with-docs, grilling, triage, improve-codebase-architecture, research, resolving-merge-conflicts, setup-matt-pocock-skills, to-spec, to-tickets, domain-modeling, codebase-design, teach, writing-great-skills, ask-matt + `skills-lock.json` |
| **Docs system** | `docs/DESIGN.md` (PRD skeleton, spec of record), `docs/GIT_WORKFLOW.md`, `docs/DEFERRED_ISSUES.md`, `docs/adr/`, `docs/references/`, `docs/agents/` (domain / issue-tracker / triage-labels / issue-template) |
| **Git workflow** | main ≡ production + dev + worktree-per-issue; per-lane merge strategy (squash → `dev`, merge commit → `main`); release vs hotfix decision rule; version axis (tracker Release ↔ tag ↔ GitHub Release); mandatory post-merge cleanup; Linear state lockstep; agent self-merge with human-review exceptions; `.githooks/pre-push` guard |
| **Stack layer** (default: Python/uv, swappable) | `pyproject.toml` (uv + hatchling + ruff + mypy strict + pytest), `main.py`, `tests/`, `config/` convention, `.env.example`, optional `Dockerfile` + `docker-compose.yml` |

The **process layer** (docs, workflow, skills) is stack-agnostic; only the stack layer
changes when a project isn't Python.

## Template evolution

This template is expected to improve as projects hit process-level problems. Downstream
repos carry a "Template feedback loop" section in their `AGENTS.md`: when a project
discovers a template-layer improvement, port it back here and record it in
`CHANGELOG.md`. Old projects pick changes up manually (there is deliberately no
auto-sync).

Skills are pinned by `skills-lock.json`; upgrade them here deliberately, not per-project.

> ⚠️ **Two skills are locally customized**: `implement/SKILL.md` (three-round review loop
> bounded by an Opus 5 escalation pass; self-merge authorization) and `code-review/SKILL.md`
> (review sub-agents pinned to `model: "opus"`). `skills-lock.json` records the *upstream*
> hash, so it cannot detect these edits — **re-vendoring via `/setup-matt-pocock-skills`
> will silently overwrite them.** Diff before accepting any skill upgrade to those two.
