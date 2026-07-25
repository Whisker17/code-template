# Git Workflow

This repo uses the **main + dev + issue-worktree** model.

## The one-sentence rule

**Every issue's implementation = a dedicated git worktree branched off latest `dev` +
a short-lived branch → PR into `dev` → tracker state moves in lockstep with the PR.**

Never develop an issue directly in the primary clone's working tree (it dirties the
`dev` workspace and blocks parallel work on multiple issues). The primary clone is only
for: pulling `dev`/`main`, creating worktrees, and post-merge verification.

## Branch roles

| Branch | Role | Who writes |
|--------|------|------------|
| `main` | Stable release line. Only accepts release merges from `dev` and hotfixes. | PR only |
| `dev` | Active integration branch for the current version. The **only** PR target for day-to-day work. | PR from issue branches |
| `feat/*` `fix/*` `chore/*` | Single-issue implementation branches (inside worktrees) | Short-lived |
| `hotfix/*` | Emergency production fixes (branched from `main`) | Sync back to `dev` after merging to `main` |
| `release/*` | Temporary promotion branches (cut from `dev`, PR → `main`) | Short-lived |

## Issue lifecycle (mandatory)

Aligned with the tracker workflow states: `Todo` → `In Progress` → `In Review` → `Done`.

```text
                fetch latest dev
                      │
                      ▼
         git worktree add (branch off origin/dev)
                      │
                      ▼
              implement one issue
                      │
                      ▼
         push + gh pr create --base dev
         tracker: state = In Review
                      │
                      ▼
              review + tests/lint green
                      │
                      ▼
         squash-merge PR → dev
         tracker: state = Done
         remove worktree + prune branch
```

### 1. Start: new worktree off latest `dev`

From the primary clone (adjust paths to your machine; a sibling directory is
recommended):

```bash
git fetch origin
git checkout dev
git pull --ff-only origin dev

# Branch name: type/{{ISSUE_PREFIX_LOWER}}-<id>-short-topic (all lowercase, dash-separated)
ISSUE={{ISSUE_PREFIX_LOWER}}-123
BRANCH=feat/${ISSUE}-short-topic
WT="../{{PROJECT_NAME}}-wt/${ISSUE}"

git worktree add -b "$BRANCH" "$WT" origin/dev
cd "$WT"
```

Tracker: set the issue to **`In Progress`**. Optionally note the worktree path and
branch name on the issue.

If the tracker suggests a branch name (e.g. Linear's `gitBranchName`), you may use it —
but the base **must** be the latest `origin/dev`, never a stale tip.

### 2. Implement

- **One worktree / one branch / one issue / one PR** (never bundle unrelated issues)
- Small commits (`feat:` `fix:` `chore:` `docs:` `refactor:` `test:`)
- Run the relevant tests inside the worktree; the full gate runs again before merge
- Never commit secrets, `.env`, large logs, or local data files

### 3. Open PR → `dev`, enter review

```bash
git push -u origin HEAD
gh pr create --base dev \
  --title "feat({{ISSUE_PREFIX}}-123): short description" \
  --body "$(cat <<'EOF'
## Summary
- ...

## Tracker
Closes {{ISSUE_PREFIX}}-123

## Test plan
- [ ] ...
EOF
)"
```

Tracker: set the issue to **`In Review` immediately** (when the PR opens — not after
merge).

PR conventions:

- **base must be `dev`** (features/fixes never target `main` directly)
- Title carries `{{ISSUE_PREFIX}}-NNN`
- Body links the tracker issue
- Merge strategy: **squash and merge**
- Remote branch is auto-deleted on merge (`delete_branch_on_merge`)

### 4. Review, merge → Done

**Fast path — PRs that went through `/implement`'s full three-round review loop** (two
review sub-agents per round on the Standards + Spec axes, three fix-and-verify rounds;
findings still open after round 3 get an escalation fix pass, and only findings that are
genuinely out of the issue's scope go to `docs/DEFERRED_ISSUES.md`): that loop **is** the
review. Once the PR reads MERGEABLE/CLEAN and the full test + lint gate passes, the
implementing agent squash-merges and runs cleanup itself — no separate human approval.

**Exceptions that always stop at `In Review` for a human:**

- Changes touching **{{HIGH_RISK_PATHS}}** (defined per-project at setup; e.g. payment
  flows, auth, production data migrations, key handling)
- `release/*` → `main` promotions
- PRs that skipped the review loop (human-implemented, or loop not run)

For those, a human reviewer:

1. Reviews the PR (code + whether it stays within the issue's scope)
2. Verifies against latest `dev` before merging (primary clone or a clean worktree):
   run the relevant tests / dry-run
3. Squash-merges the PR into `dev`
4. Tracker: set the issue to **`Done`**
5. Cleans up the local worktree (see below)

### Post-merge cleanup (mandatory, in order)

Drive these from the **primary clone**; never commit to `dev` directly.

0. **If the PR is CONFLICTING** (`dev` advanced since you branched): inside the feature
   worktree, `git merge origin/dev`, resolve, rerun the affected tests, and `git push`.
   The PR must read **MERGEABLE / CLEAN** before you merge.
1. **Squash-merge + drop the remote branch:** `gh pr merge <N> --squash --delete-branch`
2. **Remove the worktree:** `git worktree remove <worktree-path>` then
   `git worktree prune`
3. **Delete the local branch:** `git branch -D feat/{{ISSUE_PREFIX_LOWER}}-123-topic`
   (fails while the worktree still holds the branch — do step 2 first)
4. **Fast-forward local `dev`:** `git fetch origin --prune` then
   `git merge --ff-only origin/dev` (must fast-forward — never create commits on `dev`)
5. **Tracker → `Done`**

### State mapping (tracker ↔ git)

| Stage | Tracker state | Git |
|-------|---------------|-----|
| Not started | `Backlog` / `Todo` | no branch |
| Implementing | `In Progress` | worktree + branch exist, no PR (or draft) |
| PR open, awaiting review | **`In Review`** | open PR → `dev` |
| Merged | **`Done`** | squash-merged into `dev`, worktree removed |
| Abandoned | `Canceled` | PR closed, worktree removed, not merged |

Triage labels (`ready-for-agent` / `ready-for-human` / …) are **orthogonal** to workflow
state: labels say *who* does the work, state says *how far along* it is.

## Parallel issues

- One worktree per issue → naturally parallel, no dirty-workspace collisions
- Issues touching the **same module** must not run in parallel; serialize, or wait for
  the earlier PR to merge and branch the next worktree off the new `dev`
- Always `git fetch` + base on `origin/dev` before opening a new worktree

## Releasing to `main`

**Never** open a PR with `dev` as the head branch into `main` (with
`delete_branch_on_merge` enabled, merging would delete `dev`). Cut a temporary release
branch from `dev`:

```bash
git fetch origin
git checkout dev && git pull --ff-only origin dev
git checkout -b release/v0.1.0
git push -u origin HEAD
gh pr create --base main --title "release: v0.1.0" --body "..."
```

- Tag / create a GitHub Release after merging
- Temporary `release/*` branches may be auto-deleted; `dev` lives forever
- After a hotfix lands on `main`, it **must** be synced back to `dev`

## Hotfix

```bash
git fetch origin
git worktree add -b hotfix/short-topic ../{{PROJECT_NAME}}-wt/hotfix-short-topic origin/main
# … fix, PR → main …
# after merge: sync the fix back to dev (merge or cherry-pick)
```

When production is live, hotfixes outrank regular issues — anything on a
{{HIGH_RISK_PATHS}} path takes this route.

## Branch naming

| Type | Format | Example |
|------|--------|---------|
| Feature | `feat/{{ISSUE_PREFIX_LOWER}}-<id>-<topic>` | `feat/{{ISSUE_PREFIX_LOWER}}-101-user-auth` |
| Fix | `fix/{{ISSUE_PREFIX_LOWER}}-<id>-<topic>` | `fix/{{ISSUE_PREFIX_LOWER}}-112-race-condition` |
| Chore | `chore/{{ISSUE_PREFIX_LOWER}}-<id>-<topic>` | `chore/{{ISSUE_PREFIX_LOWER}}-108-lint-config` |
| Hotfix | `hotfix/<topic>` | `hotfix/login-loop` |
| Release | `release/v<semver>` | `release/v0.1.0` |

- All lowercase, words joined with `-`
- **Must include the tracker id** (`{{ISSUE_PREFIX_LOWER}}-NNN`) for PR ↔ issue tracing
- One PR does one thing

## Recommended worktree layout

```text
~/Work/src/.../
  {{PROJECT_NAME}}/              # primary clone (stays on dev)
  {{PROJECT_NAME}}-wt/
    {{ISSUE_PREFIX_LOWER}}-101/  # worktree
    {{ISSUE_PREFIX_LOWER}}-105/
    hotfix-…/
```

- Worktree directories go **outside** the primary repo (avoid nested-git confusion)
- The primary repo's `.gitignore` does not need to ignore sibling worktrees

## Forbidden

- Developing an issue in the primary clone's working tree (always use a worktree)
- Pushing feature commits directly to `main` / `dev` (always via PR)
- Force-pushing to `main` / `dev`
- Long-lived giant branches with no PR
- Bundling multiple unrelated issues in one PR
- Leaving the tracker in `In Progress` after the PR opens (must be `In Review`)
- Leaving the tracker un-`Done` after the PR merges
- Continuing work on a branch not based on latest `origin/dev` (drop the worktree,
  re-branch from fresh `dev`)
