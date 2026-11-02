# code-template

A project template for agent-driven development with a standard process. Every new
project starts from this skeleton and inherits the same workflow: **PRD-first specs,
Linear-tracked issues, worktree-per-issue git flow, release-level orchestration and review,
and a small set of core skills**.

**Runtime-neutral by design.** Skills name a *role* (`ORCHESTRATOR`, `IMPLEMENTER`,
`REVIEWER`) and an effort (`medium` | `high`), never a model. `config/agent-roles.conf`
ships verified defaults (Opus 5.5 / Sonnet 5.5 / GPT-6 Astra on pi) and an optional
`REVIEWER_FALLBACK`, maps each role to a runtime, an exact model ID and effort values, and
`scripts/agent-dispatch.sh` dispatches it. The same process runs under Claude Code, Codex,
pi, or an agent that only has a terminal. See `docs/agents/runtime.md`.

Extracted and generalized from `pm-arbitrage-bot`, where this process was battle-tested.

## How to use

1. Create a new repo from this template (GitHub "Use this template", or clone + re-init).
2. Open it in any coding agent and say: **"Read SETUP.md and execute it."** The agent:
   - interviews you (project name, Linear project, high-risk paths, stack, Docker, agent
     roles);
   - replaces every placeholder marker;
   - wires up the git/GitHub merge policy;
   - verifies the skeleton, the role config (with a real call per role) and that
     `AGENTS.md` actually loads;
   - deletes `SETUP.md`.
3. Produce the spec of record: `/grill-me <your idea>` → `/to-spec` fills `docs/DESIGN.md`.
4. Break it down: `/to-tickets` publishes Linear issues from `docs/agents/issue-template.md`,
   each with complexity (`medium` | `high`), expected scope and native blocking relations.
5. Implement. Hand a Release to `/orchestrate`, which:
   - schedules issues by real dependencies and shared-scope conflicts;
   - dispatches `/implement` per issue at the issue's effort (a worktree off the
     **resolved base**: version-scoped → `release/v{version}`, governance → `dev`,
     hotfix → `main`, never a defaulted `dev`);
   - verifies and merges serially;
   - then runs the release review loop (`/code-review` Standard or Deep: parallel bug
     hunters per angle plus an independent verifier; only verified findings count): at
     most 3 complete reviews and 2 fix batches. Version fixes stay in the original Release;
     governance-only fixes go through `dev` with their own review and fan-out. No patch
     Release is created per round.

   Standalone `/implement`, governance and hotfix PRs get one independent Quick review
   before they may merge. High-risk paths, hotfixes and every promotion wait for a human.
6. Ship: once the integration branch has passed release review, it merges into `dev`
   (human gate). Cut a temporary `release/vX.Y.Z` from `dev` → PR into `main` (merge commit,
   human gate), tag, and deploy **from the tag**. If production breaks while `dev` holds
   unshippable work, take the hotfix lane instead — `docs/GIT_WORKFLOW.md`.

## What's inside

| Layer | Contents |
|-------|----------|
| **Agent guidance** | `AGENTS.md`, the single instruction entry (no `CLAUDE.md`; Claude Code ≥ v2.1.281 loads `AGENTS.md` natively) |
| **Runtime adapter** | `docs/agents/runtime.md` (roles, effort, preflight, reviewer-unavailable rules), `config/agent-roles.conf` (role → runtime/model/effort; shipped defaults SETUP re-verifies, optional `REVIEWER_FALLBACK`, fails closed), `scripts/agent-dispatch.sh` (dispatch + `--probe`), `tests/test_agent_dispatch.py` |
| **CI** | `.github/workflows/ci.yml` (fast lint/type + smoke E2E, docs-only PRs skip them, single required check `ci-ok`, manual full/release E2E), `docs/CI.md` (design, CI-unavailable rule, tuning checklist) |
| **Skills** (9) | grill-me, to-spec, to-tickets, implement, orchestrate, code-review, handoff, ponytail, answer-me-with-html + `skills-lock.json` |
| **Docs system** | `docs/DESIGN.md` (PRD skeleton, spec of record), `docs/GIT_WORKFLOW.md`, `docs/REVIEW.md` (what review counts as failure, output format, escapes), `docs/DEFERRED_ISSUES.md`, `docs/TRAPS.md` (on-demand trap reference), `docs/adr/`, `docs/references/`, `docs/agents/` (domain / issue-tracker / triage-labels / issue-template / runtime) |
| **Git workflow** | See below; `scripts/wt-gc.sh` (safe cleanup of leftover worktrees and branches) |
| **Stack layer** (default: Python/uv, swappable) | `pyproject.toml` (uv + ruff + mypy strict + pytest), `main.py`, `tests/`, `config/` convention, `.env.example`, optional `Dockerfile` + `docker-compose.yml` |

The Git workflow covers:

- `main` ≡ production, plus `dev`, `release/v*` version integration and one worktree per
  issue;
- fail-closed base resolution;
- merge authorization per lane;
- per-lane merge strategy;
- fan-out of `dev` into every live version branch;
- the release vs hotfix decision rule;
- the version axis (tracker Release ↔ tag ↔ GitHub Release);
- mandatory post-merge cleanup;
- no worktree left behind: every worktree is removed (merged, or archived with a pushed
  `archive/<name>` tag) when its task ends; `scripts/wt-gc.sh` reports leftovers and removes
  only what it can prove finished;
- Linear state lockstep;
- the `.githooks/pre-push` guard.

The **process layer** (docs, workflow, skills) is stack-agnostic; only the stack layer
changes when a project isn't Python.

The template's own v0.2 design is `docs/references/v0.2.0-design-spec.md`.

## Template evolution

This template is expected to improve as projects hit process-level problems. Downstream
repos carry a "Template feedback loop" section in their `AGENTS.md`: when a project
discovers a template-layer improvement, port it back here and record it in
`CHANGELOG.md`. Old projects pick changes up manually (there is deliberately no
auto-sync). Projects that want skills outside the core set install them themselves; the
template does not maintain an optional skill pack.

Vendored skills are pinned by `skills-lock.json`; upgrade them here deliberately, not
per-project.

> ⚠️ **Locally customized skills** — `skills-lock.json` records the *upstream* hash, so it
> cannot detect these edits, and **re-vendoring from `mattpocock/skills` will silently
> overwrite them.** Diff before accepting any skill upgrade to:
>
> - `implement/SKILL.md` — v0.2 contract: ponytail, relevant checks, PR, handoff, no worktree
>   left behind; merge authority from `docs/GIT_WORKFLOW.md`; no TDD mandate, no built-in
>   review loop
> - `code-review/SKILL.md` — Quick / Standard / Deep modes: fresh-context `REVIEWER` bug
>   hunters per angle plus an independent verifier; `confirmed` / `refuted` / `unverified`
>   dispositions; blocking/suggestion/pre-existing finding format; diff-only re-review
> - `to-spec/SKILL.md` — fills the numbered `docs/DESIGN.md` skeleton in place (stable
>   `§` references), free-form docs only under `docs/references/`; publishes only on
>   instruction
> - `to-tickets/SKILL.md` — uses `docs/agents/issue-template.md` (complexity, scope,
>   native relations); no local-file fallback
> - `grill-me/SKILL.md` — self-contained (the separate `grilling` skill is gone)
> - `handoff/SKILL.md` — fixed field list; durable state lives in the PR, issue and
>   orchestration document
> - `orchestrate/` — first-party, not vendored; do not add it to `skills-lock.json`
> - `ponytail/` — first-party, not vendored; do not add it to `skills-lock.json`
> - `answer-me-with-html/` — local fork of `QingYunA/answer-me-with-html` v0.5.0 (adds
>   Excalidraw / UML diagrams baked via local Chrome, the `research` template, prereq /
>   finding / glossary). Not in `skills-lock.json`; source, tests and the change list live in
>   its `dev/` (`dev/README.md`). Rebuild `scripts/am.mjs` with `npm run build` after edits
