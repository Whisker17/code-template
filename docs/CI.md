# CI

One workflow, `.github/workflows/ci.yml`, kept fast and minimal. The **only required check
is `ci-ok`**.

## Workflow design

| Job | Runs | Purpose |
| --- | --- | --- |
| `changes` | every PR / push / dispatch | `git diff --name-only` against the PR base (or the pushed-from commit) → output `code=true\|false`. Docs-only = every path matches `*.md` or `docs/**`. Any error fails the job. A dispatch or a brand-new branch is `code=true`. |
| `lint` | `code == true` | ruff + mypy |
| `smoke-e2e` | `code == true` | `scripts/e2e.sh --smoke`; uploads `artifacts/` |
| `ci-ok` | always | the aggregate gate (below) |
| `manual-e2e` | `workflow_dispatch` only | `scripts/e2e.sh --full` or `--release <version>` on the selected ref, regardless of docs-only detection; uploads `artifacts/` (SHA and version are in `manifest.json`) |

Triggers: `pull_request`; `push` on `main`, `dev`, `release/v*`; `workflow_dispatch` with
`mode: full|release` and `version` (required for release). Pull-request runs are cancelled
when a newer push arrives (`concurrency` group per PR number); push runs are not, and each dispatch run has its own group so manual runs never cancel each other.
PR and push events never run `manual-e2e`.

### Why `ci-ok` exists

A path-filtered job that is skipped reports as skipped, and a branch-protection rule that
requires it would then block docs-only PRs forever — or, if "skipped" is treated as green, let
a broken change-detection step pass. So the protected check is one always-running job that
**directly** `needs` `changes`, `lint` and `smoke-e2e` and decides:

- `changes` must be `success` (failed, skipped or cancelled → `ci-ok` fails);
- `code=true` → `lint` and `smoke-e2e` must each be `success`;
- `code=false` → each must be `success` or `skipped`;
- any other output → fail.

Never require `lint` or `smoke-e2e` themselves, and never make `ci-ok` depend on a job
indirectly: a failure upstream marks an indirect dependency skipped, which would pass.

### Manual full / release E2E

```bash
gh workflow run ci.yml --ref <branch-or-tag> -f mode=full
gh workflow run ci.yml --ref <branch-or-tag> -f mode=release -f version=X.Y.Z
```

GitHub lets you dispatch a workflow only if the file exists on the **default branch**, so
this works after `ci.yml` has reached `main`. Before then, run `scripts/e2e.sh` locally and
paste the output (`docs/GIT_WORKFLOW.md` § 2).

### Stack

`uv` via `astral-sh/setup-uv` with `enable-cache: true` is the only cache. Before SETUP the
template's `pyproject.toml` name is a placeholder uv rejects, so `lint` and `scripts/e2e.sh`
run with `--no-project`; after SETUP they use the project environment.

## CI unavailable (quota exhausted, Actions off)

Do not disable or bypass the required check. Put `CI unavailable: <reason>` in the PR body
and paste the same commands run locally on the final SHA (lint, type, `scripts/e2e.sh --smoke`)
with their real output. The orchestrator (or reviewer) accepts that evidence in place of the
check. Disable Actions on forks you do not develop in, so they do not burn quota.

## Tuning checklist

Tw93's ten steps for a fast, cheap CI ([source](https://x.com/HiTw93/status/2116797957454401746)),
with the stack notes for this template. Apply them in order.

1. Pull the recent runs with `gh run list --limit 50`. Split every job into three phases —
   queued, setup, and the actual test — and look for the pattern; the slow part is often setup.
2. On a burst of pushes to a PR, run only the latest one (`cancel-in-progress`), except on
   `main`.
3. Do not run CI for docs-only changes, but mind that a skipped required check blocks the
   merge. That is why `ci-ok` is the single required check.
4. Prefer the setup action's built-in cache (`astral-sh/setup-uv` `enable-cache`,
   `actions/setup-node` `cache`, `Swatinem/rust-cache`), and mind the 10 GB cache cap per
   repository.
5. Build twice in a row locally; the second build should cost almost nothing. If it does not,
   look for a Dockerfile that `COPY`s the whole repository first, a build script that watches
   files that do not exist, and similar.
6. Download prebuilt versions of tools instead of compiling them.
7. Run jobs that do not depend on each other in parallel, and split the longest test across
   several machines.
8. Put checks that do not care about the OS on Ubuntu; use macOS (or Windows) only when the
   code needs it.
9. Do not repeat work and do not do more than needed.
10. After the change, push and measure: compare the run time before and after, then check for
    anything missed.

Beyond the list: set `timeout-minutes` on every job and upload only the artifacts you will
read, so a hung run cannot burn the quota.
