# SETUP.md — Project bootstrap runbook (self-destructing)

> **To the human:** after cloning this template, open the repo in any coding agent
> (Claude Code, Codex, …) and say *"Read SETUP.md and execute it."* That's the whole
> setup.
>
> **To the agent:** this file is an executable runbook. Work through the steps in
> order. Steps marked **[interview]** require asking the user one question at a time and
> waiting for the answer. The final step deletes this file.

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
6. **Stack** — keep the default Python/uv layer, or replace it? If replacing, agree on
   the equivalents (package manager, lint, typecheck, test commands) and rewrite the
   stack-specific files (`pyproject.toml`, `main.py`, `tests/`, the Build/test/run
   section of AGENTS.md) accordingly. Keep `tests/test_agent_dispatch.py` either way: it
   tests the dispatcher, not the stack, and runs with Python + pytest alone
   (`uv run --no-project --with pytest python -m pytest tests/test_agent_dispatch.py`).
7. **Docker** — keep `Dockerfile` + `docker-compose.yml` skeletons, or delete both?
8. **Template repo URL** (for the feedback-loop pointer; default to the URL in
   `git remote -v` before you change it) → `TEMPLATE_REPO_URL`
9. **Agent roles** — read `docs/agents/runtime.md` first, then settle, for each of
   `ORCHESTRATOR`, `IMPLEMENTER` and `REVIEWER`: the runtime (`claude` | `codex` | `pi`),
   the **exact** model ID that runtime accepts, and the runtime-native values for
   `medium` and `high` effort. **Push for a cross-vendor reviewer** — independent failure
   modes catch more than a stronger same-vendor model. The template ships every role
   unconfigured; the recorded intent (implementer Claude Opus 5.5, reviewer GPT-6 Astra)
   is not a verified value. Take IDs and effort values from the runtime itself (its
   `--help`, model list, or current config), not from memory or a catalog listing alone,
   and write them into `config/agent-roles.conf`. If a runtime cannot do one of the
   efforts, leave that mapping unset — dispatch then fails closed for it.

## 2. Replace placeholders

Every placeholder marker in the repo must be gone when you finish. Replace across all
tracked files:

- `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{LINEAR_PROJECT}}`,
  `{{LINEAR_TEAM}}`, `{{ISSUE_PREFIX}}`, `{{ISSUE_PREFIX_LOWER}}`,
  `{{HIGH_RISK_PATHS}}`, `{{TEMPLATE_REPO_URL}}`

Then verify (SETUP.md itself is exempt — it gets deleted in step 6):

```bash
grep -rn '{{' --include='*.md' --include='*.toml' --include='*.yml' --include='*.py' \
  --exclude=SETUP.md --exclude-dir=.git . \
  | grep -v 'orchestrate/implementer-prompt.md'
```

This must return nothing. **`.claude/` is deliberately in scope** — skills can carry
bootstrap markers too, and excluding that directory is how unported values survive
bootstrap. One legitimate exception: `orchestrate/implementer-prompt.md`'s
`{{PLACEHOLDER}}` launch-template slots, which are not bootstrap markers.

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
scripts/agent-dispatch.sh --probe            # every role must report ok
for role in ORCHESTRATOR IMPLEMENTER REVIEWER; do
  printf 'Reply with exactly: DISPATCH-OK\n' \
    | scripts/agent-dispatch.sh "$role" - --effort high   # must print DISPATCH-OK, exit 0
done
printf 'Reply with exactly: DISPATCH-OK\n' \
  | scripts/agent-dispatch.sh IMPLEMENTER - --effort medium
```

A role that fails stays failed: fix the mapping, or tell the user plainly that work
needing it stops at `In Review` and releases stay blocked (`docs/agents/runtime.md`
§ Reviewer unavailable). Never paper over it by switching model or effort silently.

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
