## Summary

<!-- What this PR does and why. Tracker issue: {{ISSUE_PREFIX}}-NNN. Quick-fix: no issue;
quote the owner's request verbatim instead. -->

## Base branch

Resolved from `docs/GIT_WORKFLOW.md` § Resolving the base branch.
**Never default to `dev`.**

- [ ] `release/vX.Y.Z` (version-scoped) → merge with **squash**
- [ ] `dev` (repo-wide governance carve-out only) → merge with **squash**
- [ ] `dev` (finished version-integration `release/v*` merge-back) → **merge commit**,
      never squash — **human gate**, or the owner's `--through tag` scope
- [ ] `dev` or `release/vX.Y.Z` named by the owner (quick-fix, no tracker issue) → **squash**;
      quote the owner's request under Summary. Never `main`
- [ ] `main` (hotfix, or temporary `release/*` cut) → merge with a **merge commit**,
      never squash — **human gate** (a hotfix always; a cut only without `--through tag`)

<!-- Signals this base was derived from: title prefix `[X.Y.Z]` / tracker
Release / hotfix label / carve-out paths. Targeting `main`? If
`git log origin/main..origin/dev` holds anything that must not ship yet,
this has to be a hotfix off `origin/main`, not a release. -->

## Merge authorization

Row of `docs/GIT_WORKFLOW.md` § Merge authorization this PR is under:

- [ ] Ordinary version issue → integration branch, under `/orchestrate` (release review later)
- [ ] Bootstrap issue → `dev`, under `/orchestrate`
- [ ] Governance → `dev` / standalone `/implement` — independent review passed on commit: `<sha>`
- [ ] Quick-fix → owner-named `dev` / `release/v*` — required checks + smoke E2E on the final
      HEAD, no independent review; the diff lists no high-risk or mandatory human path
- [ ] Human gate (high-risk path, mandatory human path — `.github/workflows/**` or the project's
      release/promotion scripts, never covered by `--through tag` — hotfix, `release/*` → `main`,
      finished `release/v*` → `dev`)
- [ ] Promotion under the owner's `/orchestrate <Release> --through tag` scope (it covers only
      the merge into `dev`, the cut and its merge into `main`, tag, GitHub Release, tracker
      `commitSha`/stage, cleanup; never a mandatory human path, a high-risk path or a hotfix):
      orchestration document `Authorization scope` link: `<url>`

<!-- Finished `release/v*` → `dev`: link the `Release X.Y.Z — orchestration` document,
baseline B, reviewed candidate H and the final review round. -->

## Evidence

- Commit SHA verified:
- CI unavailable: <reason, or omit this line> — then paste the same commands run locally on the
  final SHA with real output (`docs/CI.md` § CI unavailable)
- Commands and results (actual output or a link, not "tests pass"):
- Artifacts (reports, logs, screenshots), if any:
- Role / model / effort used:
- New dependency or significant abstraction, and why it is needed (omit if none):

## Testing

<!-- Which E2E scenarios exercise the acceptance criteria, the exact commands run on the
final HEAD (`scripts/e2e.sh --smoke` / `--full`, lint, type) and where their artifact is.
What was NOT tested, and why. -->

## Risk

<!-- What could break and who is affected: touched high-risk paths, config or schema
changes, migrations, anything a reviewer should look at first. "Low: docs only" is a valid
answer when true. -->

## How to revert

<!-- The exact revert (`git revert <sha>` or the squash commit) plus anything it does not
undo: data, config, generated files, a tag, a deployed version. -->

## Fan-out (any PR landing on `dev`)

- [ ] After this merges, `dev` fans out into every live `release/v*` integration
      branch **in this same session** (`docs/GIT_WORKFLOW.md` § Fan-out) —
      a governance rule is only in force on branches that carry it.
      N/A if this PR does not target `dev`.

## Release / hotfix only

- [ ] Project version bumped to match the tag being created
- [ ] Tag + GitHub Release planned; deploy will come **from the tag**, not a branch
- [ ] Hotfix: `main` will be merged back into `dev` **and `dev` pushed** after this
      lands, then `dev` fans out per the section above (an unpushed backmerge makes
      the fan-out ship nothing)
- [ ] Tracker Release `commitSha` will be backfilled after tagging

## Type

- [ ] feat
- [ ] fix
- [ ] chore
- [ ] docs
- [ ] hotfix
- [ ] quick-fix (owner's request quoted in Summary; branch `quick/<short-topic>`)
- [ ] release

## Checks

Tiers per `docs/GIT_WORKFLOW.md` § 2 Implement, all on the final HEAD:

- [ ] Required project checks (CI + what `AGENTS.md` marks for every merge) pass
- [ ] Relevant issue checks (E2E scenarios for the acceptance criteria, lint/type checks)
      pass
- [ ] Smoke E2E (`scripts/e2e.sh --smoke`) — output and manifest path pasted below
- [ ] Full E2E (`scripts/e2e.sh --full`) — governance, standalone `/implement` and hotfix
      only; N/A for an ordinary issue under `/orchestrate`
- [ ] Release E2E (`scripts/e2e.sh --release <X.Y.Z>`) — release candidates only; N/A
      otherwise
- [ ] If this touches {{HIGH_RISK_PATHS}}: verification approach documented (dry-run /
      staging / mocked)
- [ ] No new tunable parameters outside `docs/DESIGN.md` §2, or the deviation is
      explained in the Summary

## Notes

<!-- Risks, rollback plan, follow-up TODOs. Review findings consciously left unfixed
go to docs/DEFERRED_ISSUES.md in this PR, with the reason. -->
