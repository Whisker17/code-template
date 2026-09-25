# AGENTS.md

The single instruction entry for coding agents (Claude Code, Codex, pi, …) in this repo.
It holds the project facts and the load-bearing rules; details live in the linked docs —
read them when the task needs them.

## What this is

{{PROJECT_DESCRIPTION}}

The full PRD — requirements, architecture, milestones, rejected alternatives, open
risks — lives in `docs/DESIGN.md`. Read it before any design or architectural decision;
do not re-derive parameters or decisions already validated there.

## Status

<!-- Keep current: what has landed, what is architected-for but NOT implemented yet.
Agents must not assume a module exists until its issue lands. -->

Freshly bootstrapped from the project template. `docs/DESIGN.md` is not yet written —
produce it via `/grill-me` + `/to-spec` before implementing anything.

## Build, test, run

<!-- Replace with the real commands once the stack is confirmed. Default Python/uv: -->

```bash
uv sync                                  # install deps (creates .venv)
uv run pytest                            # unit tests
uv run pytest tests/test_smoke.py        # single test file
uv run ruff check .                      # lint
uv run mypy                              # type check
uv run python main.py                    # entrypoint
```

## Runtime configuration

Secrets live in `.env` (template: `.env.example`), loaded at startup — a missing required
var fails fast with a clear error. **Never commit `.env`.** Non-secret parameters live in
`config/` as validated, typed config (`config/README.md`), not hardcoded and not in `.env`.

## Architecture

Module layout is fixed by `docs/DESIGN.md` §4.2. Keep this a short mirror: one bullet
per top-level module, its responsibility, and the interfaces others may depend on.

<!-- e.g. - **`<module>/`** — responsibility; depends only on <interface>. -->

## Git workflow (mandatory)

Full rules: **`docs/GIT_WORKFLOW.md`** (authoritative if this summary ever disagrees).

**One issue = one git worktree off the resolved base = one PR into that base.** Never
implement in the primary clone. **Never default to `dev`** — resolve the base; if the
issue fits not exactly one row, **stop and surface it**.

| Category | Recognised by | Worktree base | PR base |
| --- | --- | --- | --- |
| Hotfix | `hotfix` label | `origin/main` | `main` |
| Repo-wide governance | touches **only** the carve-out list (`docs/GIT_WORKFLOW.md` § Repo-wide governance carve-out) | `origin/dev` | `dev` |
| Version-scoped work | everything else | `origin/release/v{version}` | `release/v{version}` |

- **Version:** the title prefix `[X.Y.Z]`, cross-checked against the tracker Release. If
  they disagree, or one is missing while the other exists, refuse. Never infer it from a
  milestone. Before the first production tag the version-scoped row resolves to `dev`
  (bootstrap — a resolved value, not a default).
- A missing `origin/release/v{version}` is a refusal. Cutting an integration branch is the
  owner's deliberate act, never a side effect of picking up a ticket.
- A mixed PR (carve-out + other files) is **split**; governance issues carry no version and
  no Release.
- Right after creating the worktree: `git merge-base HEAD origin/<base>` must equal
  `git rev-parse origin/<base>`; then `git config core.hooksPath .githooks` (per worktree).
- Checks come in three tiers (`docs/GIT_WORKFLOW.md` § 2 Implement): required project
  checks always, relevant issue checks for every PR, and the full suite at release
  candidates and for PRs no release acceptance covers.
- The PR body states the resolved base and the signals it came from, the evidence
  (commit SHA, commands, results) and the role/model/effort used.
- Tracker moves with the PR: `In Progress` → `In Review` (PR open) → `Done` (merged and
  cleaned up). A report of "done" is not `Done`.

### Merge authorization

| Work | Before merge | Agent may merge? |
| --- | --- | --- |
| Ordinary version issue → existing integration branch, under `/orchestrate` | Issue acceptance, required project checks and relevant issue checks on the final HEAD; orchestrator verified the evidence | Yes — review happens at release level |
| Bootstrap issue → `dev` (no production tag yet), under `/orchestrate` | Same | Yes — first release still gets a full release review |
| Governance → `dev`; standalone `/implement` | Required project checks, relevant checks and the full suite, plus one independent PR review passed on the final commit | Yes, then fan out |
| Touches **{{HIGH_RISK_PATHS}}** | Its lane's checks + documented verification | **No** — human |
| `hotfix/*` → `main` | Required and relevant checks, full suite, independent review | **No** — human |
| Finished `release/v*` → `dev` | Full suite (complete acceptance) + passed release review on the current SHA | **No** — human |
| `release/*` → `main` | Release flow | **No** — human |

No waiver of the human rows is in force; a waiver takes the shape in
`docs/GIT_WORKFLOW.md` § Waiving an exception. A tracker label alone waives nothing.

### After a merge

Follow `docs/GIT_WORKFLOW.md` § Post-merge cleanup from the primary clone: remove the
worktree and local branch, fast-forward the base, and **whenever `dev` advanced, fan out
`dev` into every live `release/v*` in the same session** — a governance rule is in force
only on branches that carry it. Merge strategy is per lane: squash into `dev` and
`release/v*`; merge commit into `main` and for a finished integration branch → `dev`.
`main` equals production; deploy **only from a tag**. Promote via a temporary
`release/vX.Y.Z` cut from `dev`, never a `dev` → `main` PR. Production broken while `dev`
holds unshippable work → hotfix lane (`docs/GIT_WORKFLOW.md` § Choosing a promotion lane).
Never commit feature work directly to `main`, `dev` or a `release/v*`; the only direct
pushes are the three documented merges (fan-out, hotfix backmerge, first push of a new
cut), with `ALLOW_DIRECT_PUSH=1`.

## Agent runtime

Runtime-neutral: skills name a **role** — `ORCHESTRATOR`, `IMPLEMENTER`, `REVIEWER` — and
an effort (`medium` | `high`); `config/agent-roles.conf` maps each to a runtime, an exact
model ID and effort values, and `scripts/agent-dispatch.sh` dispatches them. Contract:
**`docs/agents/runtime.md`**.

- Independent review runs in a **different context** from the implementation, preferably
  another vendor. Self-review in the implementing context never satisfies a review rule.
- `--probe` checks configuration only; a real one-line call proves a role works.
- A failed or missing role fails closed — no model substitution, no lower effort.
- When a model generation turns over, edit `config/agent-roles.conf` and nothing else.

## Agent skills

Skills live in `.claude/skills/<name>/SKILL.md`. Runtimes that auto-discover them expose
`/<name>`; **with no skill loader, read the file directly** — a skill is just markdown.

| Skill | Use |
| --- | --- |
| `/grill-me` | Clarify goal, constraints and acceptance by interview |
| `/to-spec` | Turn the discussion into a spec (`docs/DESIGN.md` by default) |
| `/to-tickets` | Publish issues from `docs/agents/issue-template.md`, with complexity, scope and native dependencies |
| `/implement` | One issue: worktree, ponytail, relevant checks, PR, handoff |
| `/orchestrate` | A release: schedule, integrate, release review, bounded fixes |
| `/code-review` | Independent review of a PR range or a release snapshot |
| `/handoff` | Short handoff that points at durable evidence |
| `/ponytail` | Write the least code that meets the spec |

### Issue tracker

Issues and specs live in **Linear** (project `{{LINEAR_PROJECT}}`, team `{{LINEAR_TEAM}}`),
reached via MCP, else the GraphQL API with `LINEAR_API_KEY`. No tracker reachable = stop
and report; never a shadow tracker. Issue shape: `docs/agents/issue-template.md` (English).
Access, release binding and state ownership: `docs/agents/issue-tracker.md`. Triage labels:
`docs/agents/triage-labels.md`.

### Domain docs

Spec of record: `docs/DESIGN.md`, plus `docs/adr/` for narrower later decisions
(`docs/agents/domain.md`). Known, accepted debt: `docs/DEFERRED_ISSUES.md`. Project traps
worth knowing, read on demand: `docs/TRAPS.md`.

## Template feedback loop

This repo was bootstrapped from the shared project template (`{{TEMPLATE_REPO_URL}}`).
When work here surfaces a **template-layer** improvement — a workflow rule that bit us, a
skill or config fix, a doc convention worth standardizing — tell the user so they can port
it back (and record it in the template's `CHANGELOG.md`). Project-specific learnings stay.
