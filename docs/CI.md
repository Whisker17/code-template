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
when a newer push arrives (`concurrency` group per PR number); push and dispatch runs are not.
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

Ten steps for keeping CI fast and cheap. Apply them in order; stop when the run is fast enough.

1. Measure first: read the job timings, find the slowest step and attack that one.
2. Skip work that cannot change the result: path-detect docs-only changes (`changes`), and
   aggregate with a single required check (`ci-ok`) so skipping is safe.
3. Cancel superseded runs: `concurrency` with `cancel-in-progress` for pull requests.
4. Run jobs in parallel; keep each job's critical path short (`lint` and `smoke-e2e` do not
   wait for each other).
5. Cache dependencies by lockfile hash, one cache per ecosystem: `astral-sh/setup-uv`
   `enable-cache`, `actions/setup-node` `cache`, `Swatinem/rust-cache`. No hand-rolled
   duplicate caches.
6. Use prebuilt tools (released binaries, setup actions) instead of compiling or
   installing from source on every run.
7. Run the fast, no-credential smoke tier on every PR; keep the full and release tiers
   manual (`workflow_dispatch`) or scheduled.
8. Use `ubuntu-latest`; add macOS or Windows runners only when the code needs them (they
   cost a multiple of the minutes).
9. Mind the cache budget: GitHub keeps 10 GB of cache per repository and evicts the
   least-recently-used entries, so a cache per branch or per matrix cell evicts the useful
   ones. Cache less, key narrowly.
10. Set `timeout-minutes` on every job and upload only the artifacts you will read, so a hung
    run cannot burn the quota.
scratch docs-only change
