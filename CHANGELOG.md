# Template Changelog

Improvements to the template layer, newest first. When a downstream project ports a
change back (see "Template feedback loop" in `AGENTS.md`), record it here so other
projects can pick it up deliberately.

Format: date — what changed and why — which project surfaced it (if any).

---

## Unreleased — v0.3.0

- **E2E replaces after-the-fact unit tests (WHI-2195).** `AGENTS.md` opens with
  `## Testing (read first)` (never write unit tests after code; prefer E2E and end each run
  with a verifiable, repeatable artifact; isolation tests only after listing the failure
  modes). `scripts/e2e.sh` runs `--smoke` (marker `smoke` in `tests/e2e/`, no model CLI or
  credentials), `--full` (all of `tests/e2e/` plus `tests/test_agent_dispatch.py`) and
  `--release <X.Y.Z>` (same suites, refuses on a dirty tracked tree), and writes
  `artifacts/e2e/<mode>/<version|local>/<full-sha>/manifest.json` plus raw logs
  (`artifacts/` is gitignored). The four tiers are named the same in `AGENTS.md`,
  `docs/GIT_WORKFLOW.md` § 2 and § 4, `/implement`, `/orchestrate`, the implementer prompt,
  the issue template and the PR template: **smoke E2E**, **full E2E**, **release E2E**,
  **long-run acceptance**. "Full suite" and the "leave a runnable check per branching
  change" rule are gone. `docs/agents/issue-template.md` adds the required
  `Verification cost: minutes | hours` and an optional `## Failure modes`; acceptance
  criteria become E2E scenarios. `tests/test_smoke.py` moved to `tests/e2e/test_template_smoke.py`.
  - **Downstream migration:** copy `scripts/e2e.sh` and `tests/e2e/`, map the project's own
    E2E commands into `SUITES`/`INPUTS` in the script, add the `smoke` marker to
    `pyproject.toml` and `artifacts/` to `.gitignore`, and port the doc and template edits.
    Delete low-signal unit tests during the repo's next Release (owner decision D4), with
    Ray Fernando's cleanup prompt (adopted from Ansh):
    > This repo is full of low-signal unit tests. Delete every one that wouldn't catch a
    > real bug our E2E tests miss. Fan the work out across parallel subagents.
    >
    > Then add these rules to AGENTS.md so future agents stop writing them. [the three
    > rules of `AGENTS.md` § Testing]

- **Default model roles and an optional reviewer fallback (WHI-2197).**
  `config/agent-roles.conf` ships verified defaults on `pi` (each confirmed with a real
  `DISPATCH-OK` call): `ORCHESTRATOR` `claude/claude-opus-5-5`, `IMPLEMENTER`
  `claude/claude-sonnet-5-5`, `REVIEWER` `magpie/codex/gpt-6-astra`, `medium` and `high`
  mapped as themselves. A new optional role `REVIEWER_FALLBACK` (empty by default) is validated
  like any role (`agent-dispatch.sh REVIEWER_FALLBACK` → exit 3 when undeclared); `--probe`
  reports it `unset` without failing and warns if it shares `IMPLEMENTER`'s model. It is
  usable only after a real `REVIEWER` call failed (non-zero exit, empty output or transport
  error), never for exit 2/3, at most once per review step, both outcomes recorded
  (`docs/agents/runtime.md` § Reviewer unavailable); the dispatcher never selects it.
  `AGENTS.md` carries the exception to "fails closed", `SETUP.md` 1.9 asks to keep or change
  the defaults and §4 proves the fallback by a real call when declared.
  - **Downstream migration:** copy `scripts/agent-dispatch.sh` and
    `tests/test_agent_dispatch.py`, then merge the new keys into the project's
    `config/agent-roles.conf` (keep its own model IDs; add `REVIEWER_FALLBACK_*`, empty),
    re-run the real-call loop from `SETUP.md` §4, and port the `docs/agents/runtime.md`
    and `AGENTS.md` wording. A project already setting `REVIEWER_EFFORT_HIGH="medium"`
    (research-hub) should re-verify `high` before keeping it.

- **Multi-angle adversarial release review with verification (WHI-2196).** `/code-review`
  is rewritten: a review is **hunters + one verifier**, every one a fresh `REVIEWER`
  dispatch at effort `high`. Three modes with the same names in `/code-review`,
  `/orchestrate` § 3 and `/implement`: **Quick** (governance, standalone, hotfix: one hunter
  over all six angles; needs `scripts/e2e.sh --full` on the final head, never a release
  artifact), **Standard** (a release: one hunter per angle; needs the release E2E manifest
  for H) and **Deep** (a release touching high-risk or human-approved paths: two hunters per
  angle). The six angles are spec & acceptance, failure paths, security & trust
  boundaries, cross-issue integration, verification validity and simplicity (suggestions
  only). The verifier tries to refute each finding and marks it `confirmed`, `refuted` or
  `unverified`; only `confirmed` findings are defects, and an `unverified` one touching an
  acceptance criterion blocks until resolved. Findings are `R<round>-F<n>`, stable across
  rounds; rounds 2-3 review only `H_prev..H_new`; `pre-existing` goes to
  `docs/DEFERRED_ISSUES.md`; a failed or empty dispatch is not a review and consumes no
  round. The 3 reviews / 2 fix batches budget is unchanged, and `/orchestrate` § 3 and
  `/implement` now point at `docs/agents/runtime.md` § Reviewer unavailable instead of
  restating the pre-fallback behaviour. New `docs/REVIEW.md`: what counts as failure, nit
  limits, output format, an `## Escapes` table, the replay rule (replay the escapes when
  `REVIEWER` or the skill changes and record recall here) and the recurring-class rule (a
  second occurrence of a confirmed bug class needs a preventive change with an entry here,
  with a worked example). The PR template gains `Testing`, `Risk` and `How to revert`.
  - **Downstream migration:** copy `docs/REVIEW.md` and `.claude/skills/code-review/SKILL.md`,
    port the `/orchestrate` § 3 and `/implement` Merge edits and the PR template sections,
    add the pointer to `AGENTS.md`, and list the project's high-risk paths where Deep mode
    is chosen. Seed `## Escapes` with the project's past hotfixes and post-release bugs and
    replay them once (recall goes here). Project-specific ignored paths and nit limits go
    in `docs/REVIEW.md`.

- **Fast minimal CI and a CI-unavailable rule (WHI-2198).** `.github/workflows/ci.yml`:
  `changes` (docs-only = every path `*.md` or `docs/**`; any error fails) → `lint` (ruff +
  mypy) and `smoke-e2e` (`scripts/e2e.sh --smoke`, artifact uploaded), both skipped on
  docs-only PRs; `ci-ok` directly needs all three and is the only required check (fails if
  `changes` fails, is skipped or cancelled; passes docs-only). `workflow_dispatch` runs
  `--full` or `--release <version>` as `manual-e2e`. PR runs cancel superseded runs.
  `docs/CI.md` documents the design and a 10-step tuning checklist; `docs/GIT_WORKFLOW.md`
  § 2 and the PR template add the `CI unavailable: <reason>` rule (same commands run locally
  on the final SHA, never disable the required check). `SETUP.md` §2 now greps the eight named
  bootstrap markers instead of any `{{` (so `${{ … }}` passes, `.github/workflows/` stays in
  scope) and §3 requires `ci-ok`.
  - **Downstream migration:** copy `.github/workflows/ci.yml` and `docs/CI.md`, port the
    GIT_WORKFLOW/PR-template/README edits, replace the lint/type commands in `ci.yml` and the
    `scripts/e2e.sh` suites with the project's own, replace the `SETUP`-style placeholder grep
    in any local checklist with the named-marker form, and require `ci-ok` (not `lint` or
    `smoke-e2e`) in branch protection once it has run once.

- **No worktree left behind, with a safe cleanup script (WHI-2199).** Every worktree an
  agent creates (including `.claude/worktrees/agent-*` and sub-agent worktrees) is deleted
  with its local branch when its task ends: merged, or its uncommitted changes committed,
  tagged `archive/<worktree-name>` and the tag pushed, only then `git worktree remove` +
  `git branch -D`. The session that spawned it cleans it up; a worktree kept on purpose is
  named in the final reply. Layout `../<repo>-wt/<issue-id>` and `<issue-id>-verify`.
  `scripts/wt-gc.sh` (dry run by default) classifies every worktree and local branch:
  `done` = `--select`ed or its PR merged/closed per a **successful** `gh` query; everything
  else (including `gh` errors, no PR, an open PR, a branch equal to its base) is
  `active-or-unknown`. Locked, conflicted, trunk-named (`main`, `dev`, `release/*`),
  primary and current worktrees are never touched, a dirty one only with `--select`. `--apply`
  removes a clean worktree contained in a merged PR; anything else is archived first (tag
  pushed and verified on `origin`) and any failure keeps worktree and branch. Never
  `--force`. `GIT_WORKFLOW.md` State mapping: `Done` **and** `Canceled` need the worktree
  gone. Called from `/orchestrate` preflight and release close, the end of `/implement` and
  `SETUP.md`. `.claude/worktrees/` is gitignored. E2E: `tests/e2e/test_wt_gc.py`.
  - **Downstream migration:** copy `scripts/wt-gc.sh` and `tests/e2e/test_wt_gc.py`, add
    `.claude/worktrees/` to `.gitignore`, port the `AGENTS.md`, `GIT_WORKFLOW.md` (Post-merge
    cleanup, State mapping, worktree layout, Forbidden) and `/implement` and `/orchestrate`
    edits, then run `scripts/wt-gc.sh` once and clear the existing leftovers (dry run first;
    `gh` must be authenticated or everything is reported `active-or-unknown`).

- **Unattended `/orchestrate` with a declared authorization scope (WHI-2200).**
  `/orchestrate <Release> [--through tag]` runs the whole Release in the current session: a
  session not on `ORCHESTRATOR_MODEL` warns once, records the actual model and continues (no
  hand-off to another session); implementers are native sub-agents visible to the session when
  they honour model/effort, else `agent-dispatch.sh` watched to completion, never an
  unobserved background process. It decides what the rules allow, appends each decision to the
  orchestration document's `Decision log`, and stops only for a missing release branch, an unmet
  external dependency, an exhausted review budget, a mandatory human path, a failed real
  dispatch with no usable fallback, or a human-gated step outside the declared scope. New
  **mandatory human paths** (all lanes, whatever `HIGH_RISK_PATHS` says): `.github/workflows/**`
  and the project's release/promotion scripts (new `RELEASE_SCRIPT_PATHS`, asked in `SETUP.md`
  1.5); no waiver or `--through` scope covers them. Default = the v0.2 human gates;
  `--through tag` covers, after a passed release review and release E2E on the current SHA,
  only the merge into `dev`, the temporary cut and its merge into `main`, the annotated tag,
  the GitHub Release with the release E2E artifact, the tracker Release `commitSha`/stage and
  post-merge cleanup (`scripts/wt-gc.sh` at release close); never a mandatory human path or
  high-risk path in the promotion diff, a script run, deploy, a hotfix, or a promotion result
  that differs from H. The scope is recorded in the orchestration document's `Authorization
  scope` before the first covered step. `AGENTS.md`: Releases stay small, notes in English.
  - **Downstream migration:** port the `.claude/skills/orchestrate/SKILL.md`,
    `docs/GIT_WORKFLOW.md` (§ 4 table, *Unattended promotion*, § Waiving an exception,
    § Releasing to `main`, Agent constraints 6–7), `AGENTS.md`, PR template,
    `docs/agents/runtime.md` (Orchestrator session) and `docs/agents/issue-tracker.md`
    (orchestration document sections) edits; add `RELEASE_SCRIPT_PATHS` (the real paths of every
    release/promotion script, or `none`) next to `HIGH_RISK_PATHS` in `AGENTS.md` and
    `docs/GIT_WORKFLOW.md`, and add its marker to the placeholder grep. Existing open Releases
    keep the default human gates unless the owner invokes `--through tag`.
- **Design review before Linear writes, safe batch publishing (WHI-2201).** `/to-spec` and
  `/to-tickets` dispatch `REVIEWER` (`scripts/agent-dispatch.sh`, effort high) on the draft
  with the source discussion and repo docs, for at most 3 rounds; disputes go to "Open
  questions" and, after round 3, to the owner; only then do they write. The consensus
  (rounds, changes, open disagreements) is recorded in a Linear project document.
  `docs/agents/issue-tracker.md` § Publishing ticket sets: one writer, one issue at a time
  with its id recorded, query by title before retrying a timeout, relations wired after all
  issues exist, an unconfirmed write is never reported as done.
  - **Downstream migration:** copy the two skill edits and the § Publishing ticket sets
    section; no config change.

- **Adopt mode for existing repos and a template version stamp (WHI-2202).** `SETUP.md` opens
  with a mode selection: `bootstrap` (the unchanged §§0–6) or `adopt`, which runs only the new
  `§ A` and stops. Adopt copies the process layer (`.claude/skills/`, `docs/agents/`,
  `docs/GIT_WORKFLOW.md`, `docs/REVIEW.md`, `docs/CI.md`, `docs/TRAPS.md`,
  `docs/DEFERRED_ISSUES.md`, `config/agent-roles.conf`, `scripts/`, `.githooks/`, `.github/`,
  `tests/test_agent_dispatch.py`, `TEMPLATE_VERSION`) without overwriting anything: an existing
  file that differs is listed for manual merge, `AGENTS.md` gets the missing sections merged in
  and the line `Template version: 0.3.0`. It never touches business code, remotes, branches,
  stack files or `.gitignore`, never sets `core.hooksPath`, and leaves its changes uncommitted.
  The repo's own lint/type/smoke/full commands are mapped into `AGENTS.md` and into the one
  marked block of `scripts/e2e.sh` (`# >>> E2E SUITES` … `# <<< E2E SUITES <<<`), with
  `tests/test_agent_dispatch.py` as the process-only dispatch E2E; the template's `main.py`
  smoke test is never installed (an empty smoke slot is reported as a gap). New
  `TEMPLATE_VERSION` file (`0.3.0`); `scripts/e2e.sh` now builds the manifest with `python3` and
  its `{{PROJECT_NAME}}` placeholder check is split (`[{][{]PROJECT_NAME`) so SETUP's marker
  substitution no longer rewrites it. Optional UI line for UI projects: "Avoid unnecessary
  secondary labels and descriptions. Let the layout do the explaining."
  - **Downstream migration:** a repo that copied the workflow from another downstream repo
    runs `SETUP.md` § A (adopt mode) from this template, merges the files it lists as
    conflicts by hand, and adds `artifacts/` to its `.gitignore`. A repo already on
    this template: add `TEMPLATE_VERSION` and the line `Template version: <version>` to the end
    of the `Template feedback loop` section of `AGENTS.md`, and move the suite commands in
    `scripts/e2e.sh` into the `E2E SUITES` block (change its placeholder check to
    `[{][{]PROJECT_NAME` if it still carries the literal marker).

- **Owner-requested quick-fix lane (WHI-2203).** When the owner says to just change something
  and names an existing `dev` or `release/v*`, the change runs in a `quick/<short-topic>`
  worktree off `origin/<named base>` and a `quick-fix` PR that quotes the request. It waives
  only the tracker issue/Release binding and the pre-merge review; CI, smoke E2E, squash,
  cleanup and the human gates stay. No named base, `main`, or a missing branch → refusal; a
  high-risk or mandatory human path is never eligible. Quick-fix PRs merged into a `release/v*`
  are listed in that Release's notes. Edits: `docs/GIT_WORKFLOW.md` (base table, § Quick-fix
  lane, § 4, branch naming, merge strategy), `AGENTS.md`, `.github/pull_request_template.md`.
  - **Downstream migration:** port those three files' quick-fix text; nothing else changes.
    Not yet in `SETUP.md` or `/orchestrate`, whose wording on mandatory human paths still holds.

- **Next-session prompt in `/handoff` (WHI-2204).** `.claude/skills/handoff/SKILL.md` ends every
  handoff with a `## Next-session prompt` block: one fenced, self-contained prompt the owner pastes
  into a fresh session, carrying repo path, Release and issue ids, state (commit SHAs, PR numbers),
  the exact skill invocation, stop conditions and where the durable evidence lives.
  - **Downstream migration:** copy the `## Next-session prompt` section of the skill.

---

- Content-output templates (WHI-2205): new `answer-me-with-html/references/research-post.md`
  (research-post writing contract, linked from `SKILL.md`) and a new project-level `slide`
  skill (`.claude/skills/slide/`: flow, English style guide, deck starter, Excalidraw
  `lib.mjs` / `render.mjs`, example figure). Both carry a coverage table for the ten common
  content rules. Repo copy is for agents, Notion for humans: changing one updates the other
  with a CHANGELOG bullet.
  Downstream migration: copy `.claude/skills/slide/` and `references/research-post.md`;
  add the `/slide` row to the skills table in `AGENTS.md`. To render figures, run
  `npm i puppeteer-core` in the deck dir and set `CHROME_PATH`.

## 2026-10-10 — answer-me-with-html 0.5.0-research.1: sync with upstream v0.5.0

The research fork of `.claude/skills/answer-me-with-html/` moves from upstream v0.2.2 to
v0.5.0 (upstream `533c39f`) with a three-way merge. Every fork addition is kept.

- From upstream: `am patch`, `er` and `ask` components, code blocks that quote files
  (`src=` / `lines=`), diff blocks, images, change markers in flow / tree / er, theme and
  language registries (paper theme, `theme: auto`, user themes, zh-Hant / ja / he, right-to-left
  pages), the Reply and Remark buttons, the diagram lightbox, the sheet layout planner,
  raw-HTML filtering, `--replace`, `am serve`, `am clean` and `am theme check`.
- Not taken: `am video` stays in the source but is not documented in `SKILL.md`; the plugin,
  website, bench and demo stay out. Always-on mode is now a rules-file line (see `dev/README.md`).
- The fork follows upstream's English-only repository rule: `SKILL.md`, `references/`, CLI
  output, comments and tests are English. Page labels of the research template and its
  components follow the page language (`src/languages/research.js`). The Chinese prereq /
  finding keys and evidence kinds are still accepted.
- Baking now copies only the drawn figures back into the page file, so the page script's
  load-time changes are not frozen into a baked page. `am patch` keeps the research template
  and bakes again. A figure error keeps the page closed, like an STE warning.
- The update notice of a fork version compares upstream with its base and never suggests
  `npx skills update`; `references/settings.md` says to sync by hand.
- Tests: 828 (791 pass, 37 skipped without Chrome); with `AM_TEST_BAKE=1` the real bake and
  375 px layout tests pass too.

---

## 2026-10-05 — answer-me-with-html 0.2.2-research.2: mobile layout fix

On phones, `research` pages squeezed the body to about 77 px. The desktop rule
`.am-research .am-doc-layout { 210px 1fr }` (specificity 0,2,0) came after the generic
760 px breakpoint, and it overrode the breakpoint's single-column rule (0,1,0).

- The fix adds a research-specific mobile block after the desktop rules, at the same
  specificity: single column, 12 px margins, and room for the toolbar. Findings, the
  glossary and figure headers are restacked.
- On mobile the toolbar is no longer `fixed`, so it stops covering the text.
- Diagrams keep a readable 560 px minimum width and scroll inside their frame.
- The prerequisite grid can no longer overflow on 320 px screens.
- `am shot --width <px>` reports the body width and any horizontal overflow.
- New regression tests: a static CSS-order check, and a 375 px Chrome layout test.

Surfaced by doc-hub (mobile hosting of research pages), which had worked around the bug by
injecting a CSS patch.

---

## 2026-10-03 — answer-me-with-html skill (research explainers)

Adds `.claude/skills/answer-me-with-html/`, a local fork of
[QingYunA/answer-me-with-html](https://github.com/QingYunA/answer-me-with-html) v0.2.2.
The agent writes a short Markdown draft. A bundled CLI (`scripts/am.mjs`, Node 20+, no
`npm install`) renders it to a single-file HTML page and checks the writing against
STE-derived rules. This follows Karpathy's "understand LLM output" ladder: controlled
writing, then diagrams, then HTML.

The fork adds:
- `excalidraw` sketches and `uml` (Mermaid) blueprints. They are baked into the page with
  the local Chrome (`am bake`, automatic on render; Node 22+), so the output stays offline.
  `am shot` takes one screenshot per figure for review.
- A `research` template: a drawing-sheet overview, then the body, with 5 / 30 / deep
  reading paths. The `prereq`, `finding` (with evidence kinds) and `glossary` components
  support `[[term]]` hover links.
- Research-page lint and the dev-onboarding method in `references/research.md`.

It is not in `skills-lock.json`. The source, tests and the change list live in the skill's
`dev/`. It replaces a user-level `research-explainer` skill that predated it.

---

## 2026-09-25 — v0.2.0: lightweight implementation and release orchestration (WHI-1491)

Implements `docs/references/v0.2.0-design-spec.md`. Process weight moves from every issue
to the release: designers state goal, constraints, dependencies and acceptance; the
implementer builds within bounds; the orchestrator schedules, integrates and checks
evidence; an independent reviewer examines the integrated release.

- **Roles and dispatch.** Roles are `ORCHESTRATOR`, `IMPLEMENTER` and `REVIEWER`.
  `ESCALATOR` and `EXPLORER` are gone. `config/agent-roles.conf` now holds, per role,
  `_RUNTIME` (`claude` | `codex` | `pi`), `_MODEL` (the only place a model ID lives), and
  `_EFFORT_MEDIUM` / `_EFFORT_HIGH`. `scripts/agent-dispatch.sh <ROLE> <prompt|-> --effort
  <medium|high>` translates these into runtime flags and fails closed on anything unknown
  or unconfigured (exit 2 or 3). It never substitutes a model, never lowers the effort, and
  passes the runtime's exit code through unchanged. The adapter builds the whole argv:
  there is no free-form flag or command field (a leftover `_CMD` / `_EXTRA_ARGS` fails
  closed), so model, effort and the fresh session cannot be overridden. `--probe` is
  explicitly static. The
  shipped config is unconfigured on purpose; SETUP verifies it with a real call per role.
  New `tests/test_agent_dispatch.py` covers argv, stdin and error behaviour with fake
  runtimes (no model calls).
- **Merge authorization** (`docs/GIT_WORKFLOW.md` § 4) replaces "three review rounds +
  escalation authorize a self-merge":
  - ordinary version issues merge into their integration branch under `/orchestrate` on
    acceptance and checks;
  - governance and standalone `/implement` need one independent PR review;
  - high-risk paths, **every `hotfix/*` → `main`** (newly a human gate), promotions and a
    finished `release/v*` → `dev` wait for a human;
  - `release/v*` → `dev` also needs a passed release review on the current SHA.
- **Release review loop** (`/orchestrate` § 3): at most 3 complete reviews and 2
  automatic fix batches. Version fix issues stay in the original Release;
  governance-only fixes carry no Release and go to `dev` (independent review, fan-out),
  recorded as external blockers. No patch Release per round. Findings are either blocking
  or suggestions. Evidence is bound to SHAs. Release state lives in one
  `Release X.Y.Z — orchestration` Linear document.
- **Issues** gain a required `## Execution` section (complexity `medium` | `high`, reason,
  expected scope). It drives effort and shared-scope serialization.
- **No mandatory TDD, per-issue review loop, ponytail rung report or shrink pass.**
  Verification has three tiers (`GIT_WORKFLOW.md` § 2):
  - required project checks, always;
  - relevant issue checks, for every PR;
  - the full suite, including full E2E, at release candidates and fix batches, and for
    governance, standalone and hotfix PRs.
- **Linear:** `docs/agents/issue-tracker.md` lists the reference MCP calls:
  - `list_issues` paging, then `get_issue` with `includeRelations` and `includeReleases`;
  - `save_issue` with `setReleases`, and `blocks` / `blockedBy`;
  - `list_documents` filtered by `projectId`, and `save_document`.

  Each call is marked exercised or schema-verified.
- **`/to-spec`** fills the numbered `docs/DESIGN.md` skeleton in place, so `§` references
  stay stable.
- **Default distribution is 8 skills:** grill-me, to-spec, to-tickets, implement,
  orchestrate, code-review, handoff and ponytail. Removed: ask-matt, codebase-design,
  diagnosing-bugs, domain-modeling, grill-with-docs, grilling (folded into grill-me),
  improve-codebase-architecture, prototype, research, resolving-merge-conflicts,
  setup-matt-pocock-skills, tdd, teach, triage, wayfinder and writing-great-skills; also
  `orchestrate/traps.md` and `ponytail/review.md`. `skills-lock.json` is trimmed to match.
  The Linear wayfinding section and the "re-run setup to swap tracker" rung are gone:
  with no tracker available, work is blocked; there is no shadow tracker.
- **`AGENTS.md` is the single entry.** The `CLAUDE.md` symlink is removed (Claude Code ≥
  v2.1.281 loads `AGENTS.md`; SETUP checks this with `/memory`). `AGENTS.md` shrank from
  269 lines / 13 444 bytes to 158 lines / 8 679 bytes. Full Git detail stays in
  `GIT_WORKFLOW.md`.
- **`docs/TRAPS.md`** is now an on-demand reference. Its always-needed rules (`gh
  --repo/--head`, three-dot non-empty diffs, `--probe` ≠ real call, empty reviewer
  output) moved into the authoritative docs. No entry was removed.

**Landing exception (this change only).** On the owner's decision, v0.2 lands as one PR from
`origin/main` into `main`. This waives, for WHI-1491 only, the base-routing table and the
governance/non-governance split; it is not an agent merge. Downstream routing is unchanged.

**Rollback:** revert this change with a normal revert PR. Do not reset branches or delete
review history.

---

## 2026-08-25 — `/ponytail` generation constraint

Distilled from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
`@2ed6c52c9d7e5e56942508591085fd45dea277d3`. The upstream plugin cannot reach
worktree implementers (no skill loader; Grok hooks cannot inject instructions),
so the ladder is a first-party skill wired into `/implement` and the
orchestrator's launch prompt — not an always-on `AGENTS.md` dump and not a
third `/code-review` axis.

- **New first-party skill** `.claude/skills/ponytail/` (`SKILL.md`, shrink
  checklist `review.md`). Not in `skills-lock.json`.
  `disable-model-invocation: true`. Repo overrides live in the skill: spec
  binds capability, ladder binds how; `/tdd` wins tests; designed modules win
  line-count; process report is not debt. No intensity modes — the skill *is*
  full behavior (lowest rung that satisfies the spec).
- **`/implement`** reads the skill before writing (completion criterion lives
  in the ponytail skill; the rung report goes in the PR body) and runs a
  shrink pass before round-1 `/code-review`. The shrink pass is not a review
  round and does not authorize merge.
- **`implementer-prompt.md`** adds a mandatory Read-first entry and a Report
  back pointer at the ponytail criterion; `/orchestrate` Verify reads the
  rung report from the PR body and cross-checks it against the merge; "no
  hits" greps are re-run on `<merge-sha>^`, not the merge tree.
- **`code-review`** Standards baseline gains **Reinvented Wheel** (stdlib /
  platform / already-installed dep). Two axes stay two axes.
- **Carve-out** now includes `README.md` and `CHANGELOG.md`, so a skills PR
  is no longer mixed by having to edit the customized-skills inventory and
  this file.

Do not install the upstream host plugin as the load-bearing path. The
distilled skill is the only activation path the template depends on.

---

## 2026-08-24 — `/orchestrate` skill

Ported back from `prop-amm-challenge` (WHI-1251 through WHI-1255). Four consecutive
issues there were driven by one orchestrator spawning one implementer per issue, with
adversarial review in a fresh context. The pattern worked — and wasted hours on traps
that recur — so the orchestrator's contract is now a skill rather than a remembered
habit.

- **New first-party skill** `.claude/skills/orchestrate/` (`SKILL.md`, fill-in
  `implementer-prompt.md`, pointer `traps.md`). Not vendored from `mattpocock/skills`;
  not in `skills-lock.json`. `disable-model-invocation: true` — entered only on an
  explicit human request, matching `/implement`.
- **Canonical trap registry is `docs/TRAPS.md`**, not the skill file. Skill-local
  `traps.md` is a pointer. Append-only, self-declaring trim: a silent trim is how
  three measured entries vanished between a reviewed 9-entry draft and what first
  landed. Downstream projects seed the numbered list with *their* traps; the template
  ships only process-layer entries (wrong `gh` repo, nested-worktree `--head`,
  three-dot vs two-dot, probe ≠ G1, vacuous empty reviewer stdout, `pgrep -fl`,
  generate-once-after-review).
- **`ask-matt`** routes a ready ticket *set* to `/orchestrate` rather than only
  per-ticket `/implement`. `AGENTS.md` skill table has an `/orchestrate` row.
- **What this skill is not.** It drives a set of already-written tracker issues. It
  does not invent the backlog from a vision, and it cannot self-merge when G1 (a real
  `DISPATCH-OK` dispatch, not `--probe`) fails.

**Do not port back the source project's numbered trap list.** Those cite `cargo fmt`,
a bench compile path, and a fork of a specific upstream — they are not template-true.

---

## 2026-08-14 — Version-routed PRs, fail-closed base resolution, fan-out

Ported back from `mantle-stocks-arbitrage-bots` (`8249baf`, `639c85d`), which hit the
failure this template's main+dev model sets up: every PR merged into `dev`, so when
production broke, the hotfix's backmerge landed on a trunk carrying ~15 commits of
unreleased, never-live-tested next-version work. The trunk was no longer shippable.

- **PRs route by version, fail closed.** A three-category resolution table replaces
  "one PR into `dev`": hotfix → `main`; repo-wide governance (a named carve-out file
  list — workflow docs, hooks, CI, PR template, agent-roles conf + dispatch script,
  skills) → `dev`; everything else → `release/v{version}`. The version comes from two
  independent signals — the issue-title prefix `[X.Y.Z]` (primary,
  tracker-independent) cross-checked against the tracker's release binding
  (`docs/agents/issue-tracker.md`, where the Linear-specific sharp edges now live:
  Release field, **not** `projectMilestone`). Disagree or missing → **refuse to
  start**. Never default to `dev` — a silent fallback recreates the trunk pollution
  invisibly. Bootstrap clause: before the first production tag, the version-scoped
  row resolves to `dev` (no hotfix lane exists yet), as a table row, not a default.
- **Two `release/*` lifecycles.** Temporary cut (no feature PRs, PR → `main`,
  deleted) vs long-lived version integration (receives feature PRs, merges back to
  `dev` under a human gate). Cutting one is a deliberate act, never a side effect of
  picking up a ticket.
- **Fan-out is a standing obligation.** Hotfix backmerges and governance landings on
  `dev` merge into every live `release/v*` in the same session — *a governance rule
  is only in force on branches that carry it*. Live branches come from a query (with
  refuse cases for in-flight cuts), never a name list. Source-project evidence: 9
  hotfixes in ~2 days put a version branch 11 commits behind with 15 overlapping
  files. `pre-push` now protects `release/v*`; server-side protection on those
  branches must NOT require a PR (fan-out is a direct merge).
- **Base verification generalized.** `merge-base`/`rev-parse` against
  `origin/<resolved-base>` immediately after worktree creation; the PR body states
  the resolved base and the signals it was derived from.
- **Scoped-waiver pattern (mechanism only).** How an owner waives a human merge gate:
  machine-checkable scope, expiry bound to a Release, explicit list of what stays in
  force, and the compensating control — no acceptance criterion may depend on a
  reviewer noticing anything. The downstream instance stays downstream.
- **Two footgun notes.** Annotated tags: `git rev-parse <tag>` returns the tag
  object, not the commit — use `<tag>^{commit}`. Fan-out conflicts: a green suite
  cannot catch a semantic merge bug — ask "would this fail if the fix were reverted?"
- Title convention migrates `[Mn]` (milestone) → `[X.Y.Z]` (version/Release) as the
  primary routing signal; milestones stay tracker metadata and never route git.

**Beyond the source — flow these forward to `mantle-stocks-arbitrage-bots`.** Review
found three defects the upstream text shares: (1) the hotfix backmerge never pushed
`dev`, so the fan-out behind it read an `origin/dev` without the fix and silently
shipped nothing — it now fetches, fast-forwards, merges, and pushes from the primary
clone (`git checkout dev` fails inside the hotfix worktree); (2) the fan-out query
failed *open* when `gh` was unreachable, classifying every in-flight temporary cut as
live; (3) the fan-out merge did not fast-forward the local branch first, so conflicts
got resolved against code that was no longer there. The set of direct-push exceptions
is also stated as all three (fan-out, hotfix backmerge, first push of a fresh cut)
everywhere it appears, including the `pre-push` message an operator actually reads.
Two residual issues are logged in `docs/DEFERRED_ISSUES.md`.

---

## 2026-07-28 — Runtime-neutral agent roles

The template pinned its reviewer to `model: "opus"` inside `code-review/SKILL.md` and
narrated the `/implement` escalation pass as "Opus 5". Both are Claude-Code-only
encodings, so the review path silently had no meaning under Codex, Grok, or any other
runtime — and since `/implement`'s self-merge authorization is *derived from* the review
loop having run, a portability gap could turn into an unreviewed self-merge.

**The invariant, stated once:** review happens in a **different context** than
implementation, on a model **at least as capable**, **preferably cross-vendor**. A model
name is one encoding of that; the invariant is what the workflow rests on.

- **New adapter layer.** `docs/agents/runtime.md` defines four roles — `IMPLEMENTER`,
  `REVIEWER`, `ESCALATOR`, `EXPLORER`. `config/agent-roles.conf` maps roles → commands
  (checked in, non-secret). `scripts/agent-dispatch.sh` dispatches and probes them.
  A model generation turnover is now a one-line edit in the conf, not a skill edit.
- **Subprocess dispatch is canonical; native sub-agents are an optimization.** A
  non-interactive CLI call (`claude -p`, `codex exec`, …) works in every runtime including
  ones with no sub-agent primitive, and gives every runtime an identical prompt/output
  contract. Claude Code's `Agent` tool is a faster path to the same contract, not a
  different design. Skills must not branch three ways on runtime.
- **Cross-vendor review is preferred, not a fallback.** Sonnet→Opus is stronger but shares
  the implementer's blind spots; Codex→Opus has independent failure modes. `--probe` warns
  when both sides of the review are the same vendor.
- **Degraded mode is a hard stop.** If `REVIEWER` probes unusable, the loop did not run:
  finish the work, open the PR, stop at `In Review`, name the missing role. Self-review in
  the implementing context never authorizes a self-merge. Wired into
  `docs/GIT_WORKFLOW.md` § Agent / automation constraints #4.
- **Parallelism was never the point.** Skills that fan out (`/code-review` 2,
  design-it-twice 3+, `/wayfinder` research N) need *context isolation*, not concurrency —
  serial dispatch is an explicit, documented fallback. Reducing the agent count is not.
- **Other runtime assumptions generalized:** `EnterWorktree` demoted to a labelled aside
  behind the universal `merge-base`/`rev-parse` check; Linear access became a fallback
  ladder (MCP → GraphQL + `LINEAR_API_KEY` → stop and say so, never a silent local
  tracker); `/compact` reworded as "your runtime's compaction, if it has one"; bootstrap
  entry no longer says "open in Claude Code"; `AGENTS.md` now lists skills **by file path**
  so a runtime with no skill loader can still be pointed at one.

**Two template bugs found while auditing** (unrelated to portability, both live):

- `implement/SKILL.md` still carried `pm-arbitrage-bot`'s values — a hardcoded `WHI-NNN`
  issue prefix and its trading-specific gated paths ("order-placement, stop-loss,
  circuit-breaker, private-key … once real funds are live") instead of `{{ISSUE_PREFIX}}`
  and `{{HIGH_RISK_PATHS}}`. Its gate also cited a `docs/GIT_WORKFLOW.md` section
  ("Agent 约束 #6") that does not exist in the template, so the high-risk-path gate pointed
  at a dead reference.
- **Root cause:** `SETUP.md`'s placeholder-verification grep passed
  `--exclude-dir=.claude`, so no placeholder inside a vendored skill was ever checked.
  That exclusion is why the values above survived bootstrap. `.claude/` is now in scope,
  with one narrow exception for `HTML-REPORT.md`'s report template marker.

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
