# SETUP.md — Project setup runbook (bootstrap or adopt)

> **To the human:** open the repo in any coding agent (Claude Code, Codex, …) and say
> *"Read SETUP.md and execute it."* For a new repo cloned from this template that is the
> whole setup. For an existing repo that should adopt the template's process, say
> *"Read SETUP.md and execute it in adopt mode"* from inside that repo, with the template
> checked out next to it.
>
> **To the agent:** this file is an executable runbook. Choose the mode first, then work
> through only that mode's steps, in order. Steps marked **[interview]** require asking the
> user one question at a time and waiting for the answer.

## Mode selection

Ask the user which mode, unless they already said ([interview]). The modes are exclusive:
run one, never both, and never a mix of their steps.

- **`bootstrap`** — a fresh clone of the template. Run §§0–6; the last step deletes this file.
- **`adopt`** — an existing repo with its own code, remote and branches. Run **only § A**,
  then stop. Adopt does not run §§0–6, change `origin` or any remote, create, rename or
  recreate a branch, replace stack files, reset project status, or delete SETUP.md (it is
  never copied into the target repo).

If the working directory is a fresh template clone with no code of its own, the mode is
`bootstrap`; if it already has history, source files or an `AGENTS.md` of its own, it is
`adopt` — when in doubt, ask.

## Mode: bootstrap (§§0–6)

## 0. Sanity check

Confirm you are in a fresh clone of the template (not the template repo itself): if
`git remote -v` points at the template repo (`{{TEMPLATE_REPO_URL}}`) **and** the user
has not said they want to edit the template itself, stop and ask.

## 1. Interview — collect the values

Ask **one at a time** ([interview]):

1. **Project name** (kebab-case, used as repo/package name) → `PROJECT_NAME`
2. **One-paragraph description** (what this project is; goes into AGENTS.md "What this
   is") → `PROJECT_DESCRIPTION`
3. **Linear project name** (create it in Linear if it doesn't exist — ask the user
   whether to create it via the Linear MCP tools) → `LINEAR_PROJECT`
4. **Linear team key** (e.g. `WHI`; also derives the issue prefix) → `LINEAR_TEAM`,
   `ISSUE_PREFIX` (the team key, uppercase), `ISSUE_PREFIX_LOWER` (lowercase)
5. **High-risk paths** — the areas of *this* project where an agent-authored PR must
   always stop for human review (e.g. payment flows, auth, production data migrations,
   key handling). Push the user to actually think about this; "none" is an acceptable
   answer only for throwaway projects → `HIGH_RISK_PATHS` (a short comma-separated
   phrase, e.g. `order placement, key handling`)
   Then ask for the **release/promotion scripts**: the concrete paths of every script that
   cuts, tags, publishes or deploys a release (e.g. `scripts/release.sh`, `deploy/**`).
   Together with `.github/workflows/**` they are the **mandatory human paths** — all lanes,
   whatever `HIGH_RISK_PATHS` says, and no waiver or `--through tag` scope covers them
   (`AGENTS.md` § Merge authorization). Ask for the paths, not a description; answer `none`
   only if the project has no such script → `RELEASE_SCRIPT_PATHS` (a short comma-separated
   list of paths)
6. **Stack** — keep the default Python/uv layer, or replace it? If replacing, agree on
   the equivalents (package manager, lint, typecheck, test commands) and rewrite the
   stack-specific files (`pyproject.toml`, `main.py`, `tests/`, the Build/test/run
   section of AGENTS.md) accordingly. Keep `tests/test_agent_dispatch.py` either way: it
   tests the dispatcher, not the stack, and runs with Python + pytest alone
   (`uv run --no-project --with pytest python -m pytest tests/test_agent_dispatch.py`).
7. **Docker** — keep `Dockerfile` + `docker-compose.yml` skeletons, or delete both?
8. **Template repo URL** (for the feedback-loop pointer; default to the URL in
   `git remote -v` before you change it) → `TEMPLATE_REPO_URL`
9. **Agent roles** — read `docs/agents/runtime.md` first. `config/agent-roles.conf` ships
   defaults, all on `pi`: `ORCHESTRATOR` = `claude/claude-opus-5-5`, `IMPLEMENTER` =
   `claude/claude-sonnet-5-5`, `REVIEWER` = `magpie/codex/gpt-6-astra`, each with `medium`
   and `high` effort. **Present them and ask the user, role by role, to keep or change.**
   A default is only valid if this machine's runtime accepts it: take any changed runtime
   (`claude` | `codex` | `pi`), **exact** model ID and native `medium`/`high` values from the
   runtime itself (its `--help`, model list, or current config), not from memory or a
   catalog listing alone. **Push for a cross-vendor reviewer** — independent failure modes
   catch more than a stronger same-vendor model. If a runtime cannot do one of the efforts,
   leave that mapping unset — dispatch then fails closed for it. Ask whether to declare an
   optional `REVIEWER_FALLBACK` (usable only after a real `REVIEWER` call failed; never for
   a configuration error; `docs/agents/runtime.md` § Reviewer unavailable); default: leave it
   empty. Every value kept or changed is proven in §4 by a real call.

## 2. Replace placeholders

Every placeholder marker in the repo must be gone when you finish. Replace across all
tracked files:

- `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{LINEAR_PROJECT}}`,
  `{{LINEAR_TEAM}}`, `{{ISSUE_PREFIX}}`, `{{ISSUE_PREFIX_LOWER}}`,
  `{{HIGH_RISK_PATHS}}`, `{{RELEASE_SCRIPT_PATHS}}`, `{{TEMPLATE_REPO_URL}}`

Then verify (SETUP.md itself is exempt — it gets deleted in step 6):

```bash
grep -rnE '\{\{(PROJECT_NAME|PROJECT_DESCRIPTION|LINEAR_PROJECT|LINEAR_TEAM|ISSUE_PREFIX|ISSUE_PREFIX_LOWER|HIGH_RISK_PATHS|RELEASE_SCRIPT_PATHS|TEMPLATE_REPO_URL)\}\}' \
  --include='*.md' --include='*.toml' --include='*.yml' --include='*.py' \
  --exclude=SETUP.md --exclude-dir=.git .
```

This must return nothing. It names the markers instead of matching any `{{`, so the
GitHub Actions `${{ … }}` expressions in `.github/workflows/ci.yml` pass. **`.claude/` is deliberately in scope** — skills can carry
bootstrap markers too, and excluding that directory is how unported values survive
bootstrap. `.github/workflows/` is in scope as well. `orchestrate/implementer-prompt.md`'s
`{{PLACEHOLDER}}` launch-template slots are not bootstrap markers, so the named list
never matches them.

Also:

- `pyproject.toml`: confirm `name` / `description` landed correctly
- `AGENTS.md` §Status: set to "freshly bootstrapped; DESIGN.md not yet written"
- Delete `CHANGELOG.md` — it belongs to the template repo, not to projects
- Rewrite `README.md` for the new project (the template's README describes the
  template, not your project)

## 3. Wire up git + GitHub

1. Point the remote at the new repo (create it first if needed:
   `gh repo create <owner>/<PROJECT_NAME> --private`):
   `git remote set-url origin <new-repo-url>`
2. Create the integration branch: `git checkout -b dev` (keep `main` as the release
   line). Do **not** cut a `release/v*` branch yet: until the first production tag
   exists, `docs/GIT_WORKFLOW.md` § Resolving the base branch resolves the
   version-scoped row to `dev`. The first long-lived `release/v*` integration
   branch is cut deliberately, later, when work on the next version begins while a
   deployed version is live.
3. Set merge policy on the GitHub repo. **Both** squash and merge-commit must be
   allowed — the lane decides which you use (`docs/GIT_WORKFLOW.md` § Merge strategy):
   squash for issues → `dev` or → a long-lived `release/v*`, merge commit for
   `release/*` / `hotfix/*` → `main` and for a finished version-integration branch
   merging back into `dev`.
   ```bash
   gh repo edit --enable-squash-merge --enable-merge-commit \
     --enable-rebase-merge=false --delete-branch-on-merge
   ```
4. Enable the local push guard, which refuses direct pushes to `main`, `dev`, and
   any `release/v*` branch:
   ```bash
   git config core.hooksPath .githooks
   ```
   Tell the user this must be re-run **in every worktree**, not just the primary clone.
5. Try to enable server-side branch protection on `main` and `dev` (require a PR, block
   force-push and deletion). On a **private repo on the Free plan this returns
   `403 Upgrade to GitHub Pro`** for both classic protection and rulesets — if so, say so
   plainly, note that the remote is genuinely unprotected, and move on. The `pre-push`
   hook from step 4 is the only guard until the plan allows it.

   When live `release/v*` integration branches later exist, protect them with
   **force-push and deletion blocks only — never require a PR**. Fan-out is a
   direct merge of `dev` from the primary clone, and a require-PR ruleset has no
   `ALLOW_DIRECT_PUSH` equivalent (`docs/GIT_WORKFLOW.md` § Branch protection).
   Require-a-PR on `dev` also blocks the hotfix backmerge, which is a direct push —
   keep an owner bypass, or plan to land that backmerge as a PR off `origin/main`
   (same section).
6. Initial commit on `main`, then push both branches:
   `git push -u origin main dev`.
7. Once `.github/workflows/ci.yml` has run on a PR, require the check **`ci-ok`** (and only
   that one) on `main` and `dev` where branch protection is available. Never require `lint`
   or `smoke-e2e` — they are skipped on docs-only PRs. If CI is unavailable, follow
   `docs/CI.md` § CI unavailable.

## 4. Verify the skeleton

```bash
uv sync
uv run pytest        # the smoke test must pass
uv run ruff check .
```

(Adjust if the stack was replaced in step 1.6.)

Then verify the agent roles from step 1.9. Configuration is **done only when a real
call succeeds** — `--probe` alone checks the file and `PATH`, not authentication:

```bash
scripts/agent-dispatch.sh --probe            # every role ok; REVIEWER_FALLBACK ok or unset
for role in ORCHESTRATOR IMPLEMENTER REVIEWER; do
  printf 'Reply with exactly: DISPATCH-OK\n' \
    | scripts/agent-dispatch.sh "$role" - --effort high   # must print DISPATCH-OK, exit 0
done
printf 'Reply with exactly: DISPATCH-OK\n' \
  | scripts/agent-dispatch.sh IMPLEMENTER - --effort medium
# Only if step 1.9 declared a fallback (an undeclared one exits 3 by design):
printf 'Reply with exactly: DISPATCH-OK\n' \
  | scripts/agent-dispatch.sh REVIEWER_FALLBACK - --effort high
```

A role that fails stays failed: fix the mapping, or tell the user plainly that work
needing it stops at `In Review` and releases stay blocked (`docs/agents/runtime.md`
§ Reviewer unavailable). Never paper over it by switching model or effort silently.

Then run `scripts/wt-gc.sh` once (dry run). A bootstrapped repo has no leftover worktrees; if
it lists any, remove them per `docs/GIT_WORKFLOW.md` § No worktree left behind before you
hand off.

Finally, confirm agents actually load `AGENTS.md` — the template ships no `CLAUDE.md`:

- **Claude Code** reads `AGENTS.md` natively from **v2.1.281** (`claude --version`). On an
  older client, tell the user to upgrade; a project that must stay on one may add its own
  `CLAUDE.md` import, outside the template's supported setup.
- A `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the repo or any ancestor
  directory can stop `AGENTS.md` from loading. Point out any you find; the user may set
  `claude-md-and-agents-md` in their own settings. Do not edit user or managed settings
  yourself, and do not assume a repo setting overrides them.
- Start a fresh session and check with `/memory` (or the runtime's equivalent) that
  `AGENTS.md` is listed by path. Report the result; do not assume it.

## 5. Hand off to the design phase

Tell the user the project is bootstrapped, and that the next step is producing the spec
of record: run `/grill-me <the project idea>` and then `/to-spec` to fill
`docs/DESIGN.md`. After the spec lands, `/to-tickets` breaks it into Linear issues.

## 6. Self-destruct

```bash
git rm SETUP.md
git commit -m "chore: complete template bootstrap, remove SETUP.md"
git push
```

## Mode: adopt (§ A only)

Run this section and then **stop**. `$TEMPLATE` is the path of the template checkout
(the directory that holds this SETUP.md); `$TARGET` is the repo being adopted, the current
directory. Adopt only **adds** files and merges `AGENTS.md`; it never overwrites an existing
file, so a file that already exists is reported for manual merge instead.

## A. Adopt the process layer into an existing repo

**A.0 Preconditions and the "before" snapshot.** Stop and tell the user if any is false:
`$TARGET` is a git work tree whose tracked files are clean (`git status --porcelain
--untracked-files=no` prints nothing); `$TARGET` is not the template (no `SETUP.md` in it and
`git remote -v` does not point at `{{TEMPLATE_REPO_URL}}`); `$TEMPLATE/TEMPLATE_VERSION` exists
and `git -C "$TEMPLATE" status --porcelain` prints nothing. Then:

```bash
V="$(cat "$TEMPLATE/TEMPLATE_VERSION")"      # the template version being adopted
ADOPT_TMP="$(mktemp -d)"                     # outside the repo
cd "$TARGET"
git remote -v > "$ADOPT_TMP/remotes.before"
git branch -a > "$ADOPT_TMP/branches.before"
git ls-files -co --exclude-standard -z | xargs -0 sha256sum > "$ADOPT_TMP/manifest.before"
```

**A.1 Interview** ([interview], one question at a time; this is the subset of §1 whose
values land in the copied files):

1. `PROJECT_NAME` (default: the directory name), 2. `LINEAR_PROJECT`, 3. `LINEAR_TEAM`
   (→ `ISSUE_PREFIX` uppercase, `ISSUE_PREFIX_LOWER` lowercase), 4. `HIGH_RISK_PATHS` and
   5. `RELEASE_SCRIPT_PATHS`, both exactly as asked in §1.5, 6. `TEMPLATE_REPO_URL` (default:
   `git -C "$TEMPLATE" remote get-url origin`).
7. **Verification commands** — the repo's *own* commands for **lint**, **type check**,
   **smoke** (a fast scenario that needs no model CLI or credentials) and **full** (every
   E2E/test command the repo has). `none` is allowed for each; an empty smoke or full slot is
   reported as a gap in A.6, never filled with a template test.
8. **Agent roles** — present `$TEMPLATE/config/agent-roles.conf` and keep or change it
   exactly as §1.9 describes (exact model IDs from the runtime itself, optional
   `REVIEWER_FALLBACK`).
9. **UI project?** If yes, the optional UI line in A.5.

**A.2 Copy the process layer — never overwrite.** For every path below, taken from
`git -C "$TEMPLATE" ls-files` (tracked files only):

```bash
PROCESS_PATHS=(.claude/skills docs/agents docs/GIT_WORKFLOW.md docs/REVIEW.md docs/CI.md
  docs/TRAPS.md docs/DEFERRED_ISSUES.md config/agent-roles.conf scripts .githooks .github
  tests/test_agent_dispatch.py TEMPLATE_VERSION)
: > "$ADOPT_TMP/copied.txt"; : > "$ADOPT_TMP/conflicts.txt"
git -C "$TEMPLATE" ls-files -z -- "${PROCESS_PATHS[@]}" | while IFS= read -r -d '' f; do
  if [ ! -e "$TARGET/$f" ] && [ ! -L "$TARGET/$f" ]; then
    mkdir -p "$(dirname "$TARGET/$f")"; cp -p "$TEMPLATE/$f" "$TARGET/$f"; echo "$f" >> "$ADOPT_TMP/copied.txt"
  elif ! cmp -s "$TEMPLATE/$f" "$TARGET/$f"; then
    echo "$f" >> "$ADOPT_TMP/conflicts.txt"            # exists and differs: leave it alone
  fi                                                    # identical: nothing to do
done
```

Not copied, on purpose: `main.py`, `pyproject.toml`, `tests/e2e/` (the template's smoke test
runs the template's `main.py`), `docs/DESIGN.md`, `Dockerfile`, `docker-compose.yml`,
`.env.example`, `CHANGELOG.md`, `README.md`, `SETUP.md`, `skills-lock.json`. A file the target
already has — typically `.github/workflows/ci.yml`, `.github/pull_request_template.md`, an
existing `scripts/` or `.githooks/` file — goes to `conflicts.txt` and is reported in A.6.
Do not set `core.hooksPath`: the target may already use its own hooks.

Then fill the markers **in the copied files only** (`copied.txt`; never in the target's own
files):

```bash
export PROJECT_NAME LINEAR_PROJECT LINEAR_TEAM ISSUE_PREFIX ISSUE_PREFIX_LOWER \
  HIGH_RISK_PATHS RELEASE_SCRIPT_PATHS TEMPLATE_REPO_URL
while IFS= read -r f; do
  perl -pi -e 's/\{\{(PROJECT_NAME|LINEAR_PROJECT|LINEAR_TEAM|ISSUE_PREFIX_LOWER|ISSUE_PREFIX|HIGH_RISK_PATHS|RELEASE_SCRIPT_PATHS|TEMPLATE_REPO_URL)\}\}/$ENV{$1}/g' "$f"
done < "$ADOPT_TMP/copied.txt"
tr '\n' '\0' < "$ADOPT_TMP/copied.txt" | xargs -0 grep -nE '\{\{(PROJECT_NAME|PROJECT_DESCRIPTION|LINEAR_PROJECT|LINEAR_TEAM|ISSUE_PREFIX|ISSUE_PREFIX_LOWER|HIGH_RISK_PATHS|RELEASE_SCRIPT_PATHS|TEMPLATE_REPO_URL)\}\}'   # must print nothing
```

**A.3 Merge `AGENTS.md`.** If `$TARGET/AGENTS.md` does not exist, create it with the title
`# AGENTS.md` and a one-line description. Take these `## ` sections from `$TEMPLATE/AGENTS.md`,
in this order, with the markers filled as above, and never modify an existing section:

- `Testing (read first)` — insert it above the target's first `## ` section; every other
  section is appended at the end of the file.
- `Git workflow (mandatory)`, `Agent runtime`, `Agent skills`, `Template feedback loop`.

If the target already has a section on the same topic (the same heading once a trailing
parenthetical such as `(mandatory)` is dropped), do **not** touch it: add
`AGENTS.md § <heading>` to `conflicts.txt` instead. Never copy `What this is`, `Status`,
`Build, test, run`, `Runtime configuration` or `Architecture`: they describe a project, and the
target has its own. Record the version with the line `Template version: $V` as the last line
of the `Template feedback loop` section (appended, or — if that section already existed — added
to the end of the existing one; that single line is the only change to an existing section).
Finally append a `## Verification commands` section (heading free of conflict, else
`## Verification commands (template adopt)`) listing the commands from A.1.7: lint, type
check, smoke, full, and the dispatch E2E, each with its exact command, and what
`scripts/e2e.sh --smoke` and `--full` run.

**A.4 Configure the verification contract.** The runner `scripts/e2e.sh` reads its suite
commands from **one marked block**, between `# >>> E2E SUITES` and `# <<< E2E SUITES <<<`.
If `scripts/e2e.sh` was copied (it is not in `conflicts.txt`), replace the **whole content of
that block and nothing outside it** so that:

- `SUITES` in smoke mode is the repo's own smoke command(s) from A.1.7, then the dispatch E2E;
- `SUITES` in full and release mode is the repo's own full command(s), then the dispatch E2E;
- the dispatch E2E is `uv run --no-project --with pytest python -m pytest tests/test_agent_dispatch.py`
  (it tests only `scripts/agent-dispatch.sh` against fake runtimes, needs Python + pytest and
  no model CLI; use `python3 -m pytest …` when pytest is installed and `uv` is not; if neither
  exists, the dispatch E2E is a gap and A.6 reports it);
- `INPUTS` lists the config and fixture files those commands read, plus
  `scripts/agent-dispatch.sh` (and `tests/test_agent_dispatch.py` outside smoke mode);
- no command references the template's `main.py`, `tests/e2e/` or `pyproject.toml` placeholder
  check. An empty smoke or full slot from A.1.7 stays empty and is reported as a gap.

If `scripts/e2e.sh` is in `conflicts.txt`, do not edit the target's: report that the dispatch
E2E is not wired in and show the block to merge by hand.

Then prove it, in the target: `scripts/e2e.sh --smoke` and `scripts/e2e.sh --full` must both
exit 0. If a repo command fails, stop and tell the user; do not edit the repo's commands or
tests to make it pass. The runs write `artifacts/` (untracked); adopt does not touch the
target's `.gitignore`, so tell the user to add `artifacts/` to it.

**A.4b Adapt a newly copied CI workflow.** Only if `.github/workflows/ci.yml` is in
`copied.txt` (a conflicting one stays untouched and is reported in A.6). The copy is the
template's Python workflow; edit it, in the target, so it runs the target's stack:

- `lint` job: replace the `ruff + mypy` step's `run` (and rename the step) with the lint and
  type commands from A.1.7, one per line (a `none` slot is dropped; with both `none`, delete the `lint` job and
  remove `lint` from `ci-ok`'s `needs`, its `LINT` env and its result loop);
- toolchain: in every job that runs a repo command (`lint`, `smoke-e2e`, `manual-e2e`) add the
  setup step the stack needs (for example `actions/setup-node`, `actions/setup-go`) and point
  its cache at the stack's lockfile instead of `cache-dependency-glob: pyproject.toml`. Keep
  `astral-sh/setup-uv` only in jobs that run the dispatch E2E (`smoke-e2e`, `manual-e2e`);
  drop it from `lint` unless a lint command uses `uv`;
- keep `changes`, `ci-ok`, the triggers and the artifact upload as they are.

Then prove it: extract each edited `run` block of `lint` and `smoke-e2e` and run it in the
target with `bash -e -o pipefail`; every one must exit 0 (a repo command that fails: stop and
tell the user, as in A.4). The workflow file is a mandatory human path in the target: say in
A.6 that this `ci.yml` goes through the owner like any workflow edit, and that the `ci-ok`
check must be required once it has run on a PR.

**A.5 Optional UI line.** For a UI project, offer to add this sentence under the target's
existing UI/style section of `AGENTS.md`, or under a new `## UI` section: "Avoid unnecessary
secondary labels and descriptions. Let the layout do the explaining." Skip it if the user
declines.

**A.6 Verify and report.** Verify the roles from A.1.8 (a default is valid only after a real
call succeeds):

```bash
scripts/agent-dispatch.sh --probe
for role in ORCHESTRATOR IMPLEMENTER REVIEWER; do
  printf 'Reply with exactly: DISPATCH-OK\n' | scripts/agent-dispatch.sh "$role" - --effort high
done
printf 'Reply with exactly: DISPATCH-OK\n' | scripts/agent-dispatch.sh IMPLEMENTER - --effort medium
```

A role that fails stays failed (`docs/agents/runtime.md` § Reviewer unavailable); say so. Then
check that adopt changed nothing it must not:

```bash
cd "$TARGET"
sha256sum -c --quiet "$ADOPT_TMP/manifest.before" 2>&1 | grep -v '^AGENTS.md: FAILED'   # only "WARNING: 1 computed checksum did NOT match" (AGENTS.md) may appear
git remote -v    | diff - "$ADOPT_TMP/remotes.before"                                   # no output
git branch -a    | diff - "$ADOPT_TMP/branches.before"                                   # no output
```

Report to the user, in this order: every file in `conflicts.txt` (the template's version is
in `$TEMPLATE`; merge by hand, nothing was overwritten) — a conflicting
`.github/workflows/ci.yml` also means the repo's CI does not yet run `scripts/e2e.sh --smoke`
behind a single required `ci-ok` check (`docs/CI.md`); the files copied (a copied `ci.yml` was adapted in A.4b; it goes through the owner like any
workflow edit); the template version
recorded; the gaps (no smoke or full scenario, no dispatch E2E, missing `artifacts/` ignore);
that `core.hooksPath` was not set (the user runs `git config core.hooksPath .githooks` per
worktree if the repo uses no hooks of its own); that branch resolution
(`docs/GIT_WORKFLOW.md` § Resolving the base branch) fails closed until the repo has the
integration branch it names, which the owner cuts deliberately; and that the changes are
**uncommitted** in the work tree for the user to commit through the repo's own flow. Do not
commit, push, or delete anything. Then stop: do not continue with §§0–6.
