# SETUP.md — Project bootstrap runbook (self-destructing)

> **To the human:** after cloning this template, open the repo in Claude Code and say
> *"Read SETUP.md and execute it."* That's the whole setup.
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
   section of AGENTS.md) accordingly.
7. **Docker** — keep `Dockerfile` + `docker-compose.yml` skeletons, or delete both?
8. **Template repo URL** (for the feedback-loop pointer; default to the URL in
   `git remote -v` before you change it) → `TEMPLATE_REPO_URL`

## 2. Replace placeholders

Every placeholder marker in the repo must be gone when you finish. Replace across all
tracked files:

- `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{LINEAR_PROJECT}}`,
  `{{LINEAR_TEAM}}`, `{{ISSUE_PREFIX}}`, `{{ISSUE_PREFIX_LOWER}}`,
  `{{HIGH_RISK_PATHS}}`, `{{TEMPLATE_REPO_URL}}`

Then verify (SETUP.md itself is exempt — it gets deleted in step 6):

```bash
grep -rn '{{' --include='*.md' --include='*.toml' --include='*.yml' --include='*.py' \
  --exclude=SETUP.md --exclude-dir=.claude .
```

This must return nothing.

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
   line).
3. Set merge policy on the GitHub repo (squash-only + delete branch on merge):
   ```bash
   gh repo edit --enable-squash-merge --enable-merge-commit=false \
     --enable-rebase-merge=false --delete-branch-on-merge
   ```
4. Initial commit on `main`, then push both branches:
   `git push -u origin main dev`.

## 4. Verify the skeleton

```bash
uv sync
uv run pytest        # the smoke test must pass
uv run ruff check .
```

(Adjust if the stack was replaced in step 1.6.)

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
