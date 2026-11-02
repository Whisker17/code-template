# AGENTS.md

The single instruction entry for coding agents (Claude Code, Codex, pi, …) in this repo.
It holds the project facts and the load-bearing rules; details live in the linked docs —
read them when the task needs them.

## Testing (read first)

- NEVER write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex
  features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, FIRST write all the ways it could fail,
  THEN write the code.

`scripts/e2e.sh` is the one entry point; it writes the artifact
(`artifacts/e2e/<mode>/<version|local>/<full-sha>/manifest.json` plus raw logs). The four
verification tiers (`docs/GIT_WORKFLOW.md` § 2 Implement) are **smoke E2E**, **full E2E**,
**release E2E** and **long-run acceptance**.

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
scripts/e2e.sh --smoke                   # smoke E2E: every PR; needs no model CLI or credentials
scripts/e2e.sh --full                    # full E2E: all of tests/e2e/ + tests/test_agent_dispatch.py
scripts/e2e.sh --release 0.3.0           # release E2E: same suites; refuses on a dirty tracked tree
uv run pytest tests/e2e/test_template_smoke.py   # single E2E file
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
| Quick-fix | the owner says "just change it" **and names an existing `dev` or `release/v*`** | `origin/<named base>` | `<named base>` |

- **Version:** the title prefix `[X.Y.Z]`, cross-checked against the tracker Release. If
  they disagree, or one is missing while the other exists, refuse. Never infer it from a
  milestone. Before the first production tag the version-scoped row resolves to `dev`
  (bootstrap — a resolved value, not a default).
- A missing `origin/release/v{version}` is a refusal. Cutting an integration branch is the
  owner's deliberate act, never a side effect of picking up a ticket.
- **Quick-fix** (`docs/GIT_WORKFLOW.md` § Quick-fix lane): no named base (or `main`, or a
  missing branch) → refuse, never a default. Branch `quick/<short-topic>`, PR type
  `quick-fix` quoting the owner's request. Waives only the tracker issue/Release binding and
  the pre-merge review; CI, smoke E2E, cleanup and every human gate stay. Never eligible for a
  high-risk or mandatory human path.
- A mixed PR (carve-out + other files) is **split**; governance issues carry no version and
  no Release.
- Right after creating the worktree: `git merge-base HEAD origin/<base>` must equal
  `git rev-parse origin/<base>`; then `git config core.hooksPath .githooks` (per worktree).
- Checks (`docs/GIT_WORKFLOW.md` § 2 Implement): required project checks and relevant
  issue checks always, plus the E2E tier of the lane — **smoke E2E** on every PR, **full
  E2E** on the final head of governance, standalone `/implement` and hotfix PRs, **release
  E2E** at each release candidate and after each fix batch, **long-run acceptance** only
  for `Verification cost: hours` issues, at most once per Release, scheduled by the owner.
- The PR body states the resolved base and the signals it came from, the evidence
  (commit SHA, commands, results) and the role/model/effort used.
- Tracker moves with the PR: `In Progress` → `In Review` (PR open) → `Done` (merged and
  cleaned up). A report of "done" is not `Done`.
- Releases stay small (0.1.0, 0.1.1, …); Release notes are written in English.

### Merge authorization

| Work | Before merge | Agent may merge? |
| --- | --- | --- |
| Ordinary version issue → existing integration branch, under `/orchestrate` | Issue acceptance, required project checks, relevant issue checks and smoke E2E on the final HEAD; orchestrator verified the evidence | Yes — review happens at release level |
| Bootstrap issue → `dev` (no production tag yet), under `/orchestrate` | Same | Yes — first release still gets a full release review |
| Governance → `dev`; standalone `/implement` | Required project checks, relevant checks and full E2E, plus one independent PR review passed on the final commit | Yes, then fan out (unless a human row below applies) |
| Quick-fix → owner-named `dev` / `release/v*` | Required project checks and smoke E2E on the final HEAD; PR quotes the owner's request; no high-risk or mandatory human path in the diff | Yes — no independent review; never into `main` |
| Touches **{{HIGH_RISK_PATHS}}** | Its lane's checks + documented verification | **No** — human; a quick-fix is never eligible |
| Touches a **mandatory human path**: `.github/workflows/**` or the project's release/promotion scripts (`{{RELEASE_SCRIPT_PATHS}}`), in every lane, whatever `{{HIGH_RISK_PATHS}}` says | Its lane's checks + documented verification | **No** — human; no waiver, no `--through tag` scope and no quick-fix request covers it |
| `hotfix/*` → `main` | Required and relevant checks, full E2E, independent review | **No** — human |
| Finished `release/v*` → `dev` | Release E2E (complete acceptance) + passed release review on the current SHA | **No** — human, unless `/orchestrate <Release> --through tag` |
| `release/*` → `main` | Release flow | **No** — human, unless `/orchestrate <Release> --through tag` |

`/orchestrate <Release> --through tag` is the owner's declared scope for one Release: after a
passed release review and release E2E on the current SHA it covers only the merge into `dev`,
the temporary cut and its merge into `main`, the annotated tag, the GitHub Release with the
release E2E artifact, the tracker Release `commitSha`/stage and post-merge cleanup. It never
covers a mandatory human path (`.github/workflows/**`, the project's release/promotion
scripts) or a high-risk path, running those scripts, deploy or a hotfix. The recorded scope
and the rule are `docs/GIT_WORKFLOW.md` § 4 *Unattended promotion*.

No waiver of the human rows is in force; a waiver takes the shape in
`docs/GIT_WORKFLOW.md` § Waiving an exception, and none can cover a mandatory human path (a quick-fix request is not a waiver).
A tracker label alone waives nothing.

### No worktree left behind

Every worktree an agent creates (including `.claude/worktrees/agent-*` and pi sub-agent
worktrees) is deleted, together with its local branch and private build dirs, when its task
ends. Layout: `../<repo>-wt/<issue-id>`; verification worktrees
`../<repo>-wt/<issue-id>-verify`.

- Before deleting, the work is either merged into the target branch, or its uncommitted
  changes are committed, tagged `archive/<worktree-name>` and the **tag pushed**; only after
  the push succeeded: `git worktree remove` (never `--force`) + `git branch -D`.
- The session that spawned a worktree cleans it up (an orchestrator owns its implementers').
  A worktree kept on purpose is named, with path and reason, in the final reply.
- `scripts/wt-gc.sh` reports leftovers (dry run) and, with `--apply`, removes only items it
  can prove `done`. It never deletes active or unknown-state work: `gh` errors, a branch equal
  to its base, a missing upstream, a locked, conflicted or (unless `--select`ed) dirty
  worktree are all preserved. Linear `Done` **and** `Canceled` require the worktree removed.
  Details: `docs/GIT_WORKFLOW.md` § Post-merge cleanup.

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

Runtime-neutral: skills name a **role** — `ORCHESTRATOR`, `IMPLEMENTER`, `REVIEWER`
(plus an optional `REVIEWER_FALLBACK`) — and an effort (`medium` | `high`);
`config/agent-roles.conf` ships verified defaults and maps each role to a runtime, an exact
model ID and effort values; `scripts/agent-dispatch.sh` dispatches them. Contract:
**`docs/agents/runtime.md`**.

- Independent review runs in a **different context** from the implementation, preferably
  another vendor. Self-review in the implementing context never satisfies a review rule.
- `--probe` checks configuration only; a real one-line call proves a role works.
- A failed or missing role fails closed — no model substitution, no lower effort — except
  the declared `REVIEWER_FALLBACK` under `docs/agents/runtime.md` § Reviewer unavailable
  (only after a real `REVIEWER` call failed; never for exit 2/3).
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
| `/orchestrate` | A release, unattended in-session (`<Release> [--through tag]`): schedule, integrate, release review, bounded fixes; `--through tag` completes promotion |
| `/code-review` | Multi-angle adversarial review of a PR range or a release snapshot: parallel bug hunters plus a verifier (modes Quick, Standard, Deep) |
| `/handoff` | Short handoff that points at durable evidence |
| `/ponytail` | Write the least code that meets the spec |
| `/answer-me-with-html` | Explain an answer or share research as a one-page HTML explainer (Excalidraw sketches, UML blueprints, prerequisite cards, findings); `research` template for dev onboarding |
| `/slide` | Build a 1920×1080 single-file HTML deck (bilingual, Excalidraw figures, PDF export) for a talk or briefing |

### Issue tracker

Issues and specs live in **Linear** (project `{{LINEAR_PROJECT}}`, team `{{LINEAR_TEAM}}`),
reached via MCP, else the GraphQL API with `LINEAR_API_KEY`. No tracker reachable = stop
and report; never a shadow tracker. Issue shape: `docs/agents/issue-template.md` (English).
Access, release binding and state ownership: `docs/agents/issue-tracker.md`. Triage labels:
`docs/agents/triage-labels.md`.

### Domain docs

Spec of record: `docs/DESIGN.md`, plus `docs/adr/` for narrower later decisions
(`docs/agents/domain.md`). What review counts as failure, its output format and the record
of escapes: `docs/REVIEW.md`. Known, accepted debt: `docs/DEFERRED_ISSUES.md`. Project traps
worth knowing, read on demand: `docs/TRAPS.md`.

## Template feedback loop

This repo follows the shared project template (`{{TEMPLATE_REPO_URL}}`), set up from it via
`SETUP.md` (bootstrap or adopt).
When work here surfaces a **template-layer** improvement — a workflow rule that bit us, a
skill or config fix, a doc convention worth standardizing — tell the user so they can port
it back (and record it in the template's `CHANGELOG.md`). Project-specific learnings stay.

Template version: 0.3.0
