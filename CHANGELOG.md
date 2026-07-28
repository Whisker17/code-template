# Template Changelog

Improvements to the template layer, newest first. When a downstream project ports a
change back (see "Template feedback loop" in `AGENTS.md`), record it here so other
projects can pick it up deliberately.

Format: date — what changed and why — which project surfaced it (if any).

---

## 2026-07-28 — Release/hotfix lanes + full skill parity

Ported back from `pm-arbitrage-bot`, which hardened its workflow after shipping five
releases and discovering the template's promotion rules were underspecified.

**Git workflow (`docs/GIT_WORKFLOW.md`)** — the substantive change:

- **`main` ≡ production**, defined as always equal to the last deployed tag. The two
  promotion lanes are only distinguishable once that holds.
- **Release-vs-hotfix decision rule**, mechanical: if
  `git log origin/main..origin/dev` holds a single commit you would not ship right now,
  the hotfix lane is mandatory. Cutting a release to rush one fix drags everything on
  `dev` into production.
- **Per-lane merge strategy** — squash into `dev`, **merge commit** into `main`.
  Squashing a release/hotfix creates a commit absent from `dev`'s history, so the tag
  lands on a disconnected branch and `git log <tag>..origin/dev` silently returns
  garbage. `pm-arbitrage-bot` squashed v0.1.1–v0.1.5 before catching this and left five
  orphaned commits on `main`. **This reverses the template's previous squash-only
  policy** — `SETUP.md` no longer passes `--enable-merge-commit=false`.
- **Version axis** — tracker Release ↔ annotated git tag ↔ GitHub Release must agree;
  backfill the Release's `commitSha` as the authoritative version↔code binding.
  Milestones and Releases are orthogonal axes. Hotfixes take a fourth version segment
  (`0.1.5.1`) rather than stealing the next minor.
- **Deploy from tags only, never branches** — a branch deploy leaves nobody able to say
  which tree production is running.
- **Base verification after every worktree creation** (`merge-base` vs `rev-parse`).
  Claude Code's `EnterWorktree` branches from `origin/<default-branch>` = `main`, which
  is wrong for the issue lane and coincidentally right for hotfixes.
- Hotfix lane now requires a patch version bump before tagging and a `main` → `dev`
  merge-back, or the next release re-ships the fixed bug.
- Expanded **Forbidden** list; new **Agent / automation constraints** section (the
  high-risk-path gate explicitly overrides the self-merge pre-authorization).
- New **Branch protection** section: private repos on the Free plan get
  `403 Upgrade to GitHub Pro` for both classic protection and rulesets, so
  `.githooks/pre-push` is the stand-in.

**New: `.githooks/pre-push`** — refuses direct pushes to `main`/`dev`, `ALLOW_DIRECT_PUSH=1`
to override. Must be enabled per clone *and per worktree* (`git config core.hooksPath
.githooks`); `SETUP.md` now does this at bootstrap.

**Skills: 15 → 22 (full parity with `pm-arbitrage-bot`)** — added `diagnosing-bugs`,
`wayfinder`, `prototype`, `grill-with-docs`, `teach`, `writing-great-skills`, `ask-matt`.
Reverses the "trimmed from 22" decision below. Two caveats recorded in `README.md`:
`ask-matt` routes to five skills neither repo vendors, and `skills-lock.json` stores
upstream hashes so it cannot detect the local customizations in `implement`/`code-review`.

**`docs/agents/issue-tracker.md`** — new **Wayfinding operations** section (Linear map
issue, `parent` sub-issues, native blocking, frontier query). Without it `/wayfinder`
silently falls back to a local-markdown tracker; `pm-arbitrage-bot` has this gap too.

**`docs/agents/triage-labels.md`** — documents `hotfix` as the one type label that changes
git behaviour, so agents read labels before choosing a base branch.

## 2026-07-25 — Initial extraction

Extracted and generalized from `pm-arbitrage-bot` (dev branch):

- AGENTS.md as canonical agent guidance, CLAUDE.md symlinked.
- 15 vendored skills (trimmed from 22) + trimmed `skills-lock.json`.
- Docs system: DESIGN.md PRD skeleton as spec of record, GIT_WORKFLOW.md,
  DEFERRED_ISSUES.md, adr/, agents/ four-pack.
- Linear as default tracker; ticket-set publishing rules (native blocked-by relations)
  added to `docs/agents/issue-tracker.md` so `/to-tickets` output lands Linear-native.
- Worktree-per-issue git flow with agent self-squash-merge + high-risk-path
  human-review exceptions (paths defined per-project at setup).
- Minimal Python/uv stack layer (no CI, no shared core/ helpers — deliberate).
- SETUP.md self-destructing bootstrap runbook.
