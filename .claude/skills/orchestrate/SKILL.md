---
name: orchestrate
description: "Drive one tracker Release unattended in this session: schedule by real dependencies, verify and merge serially, run the bounded release review loop and, with --through tag, complete promotion through tag and GitHub Release."
disable-model-invocation: true
---

You are the **ORCHESTRATOR** (`docs/agents/runtime.md`). You schedule, verify and merge;
you do not implement features, and you never declare a review passed on the reviewer's
behalf. Implementers follow `/implement`; reviews follow `/code-review`; neither is
restated here. `docs/GIT_WORKFLOW.md` and `docs/agents/issue-tracker.md` are authoritative
wherever this skill summarises them.

Nothing counts as evidence unless it is in Git, a PR, the tracker or a check's output: not
chat, not a running process, not an agent saying "done".

## Invocation and authority

`/orchestrate <Release> [--through tag]`. Run the whole Release in **this session**.

- **Unattended.** Decide everything the rules allow; do not stop to ask. Append each
  decision (what, and the rule or evidence behind it) to the `Decision log` section of the
  orchestration document as you make it.
- **Stop only for:** a missing release branch; an unmet external dependency; the review
  budget exhausted (§ 3); a mandatory human path (below); a failed real dispatch with no
  usable fallback (`docs/agents/runtime.md` § Reviewer unavailable); a human-gated step
  outside the declared authorization scope. Stopping means: record the blocker in the
  orchestration document, leave the affected issue or PR at `In Review`, and report.
- **Mandatory human paths** (every lane, whatever `{{HIGH_RISK_PATHS}}` says):
  `.github/workflows/**` and the project's release/promotion scripts (`AGENTS.md`
  § Merge authorization). A PR touching one is never agent-merged, and no waiver or
  `--through tag` scope covers it.
- **Default scope** is the human gates of `docs/GIT_WORKFLOW.md` § 4: stop at finished
  `release/v*` → `dev`, every cut and every merge into `main`.
- **`--through tag`** authorizes the steps of § 4 below, and only those, for this Release.
  Write the **Authorization scope** section of the orchestration document before the first
  covered step, in the shape of `docs/GIT_WORKFLOW.md` § Waiving an exception. Any other
  human-gated step is outside the scope: stop.

## 1. Preflight

Input is an explicit Linear project **and** Release. Never guess from a similar title or a
milestone.

0. If this session is not running `ORCHESTRATOR_MODEL`, warn once, record the actual model
   and effort in the orchestration document and continue. A config file cannot switch a
   running session, and this is no reason to start another one.
1. Read the whole Release (`docs/agents/issue-tracker.md` § Reading a release — every page).
2. For each issue, check its version signals and resolve the Git base
   (`docs/GIT_WORKFLOW.md` § Resolving the base branch). A missing version branch is a
   blocker to report, never something to create.
3. Check for external blockers, dependency cycles, unmeetable acceptance criteria and
   missing `## Execution` data. A cycle or a version-signal mismatch blocks those issues;
   fix the issue set, do not pick an order anyway.
4. Mark issues that hit high-risk paths, and pairs whose expected scopes share a module,
   schema, public interface or generated file.
5. Check GitHub, Linear and the project's real verification commands. Make one real
   `DISPATCH-OK` call per role you will use (`docs/agents/runtime.md` § Preflight) — once
   per release, again only after a config change or an auth/call error.
6. Run `scripts/wt-gc.sh` (dry run) and clear leftovers before dispatching anything
   (`docs/GIT_WORKFLOW.md` § No worktree left behind). `--apply` removes only what it proves
   `done`; pass `--select <path>` only for a worktree you can attribute to a finished or
   abandoned task of this orchestration. A worktree you cannot attribute is not yours: report
   it, never select it.
7. Create or reuse the `Release X.Y.Z — orchestration` document (sections in
   `docs/agents/issue-tracker.md` § Release orchestration document, including `Decision log`
   and `Authorization scope`). Record the planned issue
   set, the integration branch, the contract version (`v0.2`) and the fixed baseline
   **B**: the verified commit this version starts from. When taking over a release in
   progress, establish B from the record — never from today's HEAD, which would hide work
   already merged. If you cannot establish it, recover that evidence first. Issues already
   running under an older contract finish or pause with a handoff before the switch.

A canceled blocker is not a satisfied one: an issue that needed its output needs an
explicit substitute or a corrected relation. An unfinished external blocker blocks only
the issues that depend on it.

## 2. Schedule and integrate

- An issue may start only when every real dependency is satisfied. If it builds on a
  predecessor's code, that PR must already be merged.
- Shared module, schema, public interface or generated file ⇒ **serial**, even with no
  `blocks` edge. A clean Git merge is not proof of independence.
- Independent issues run in parallel: one `IMPLEMENTER` dispatch, one worktree and one PR
  per issue, up to the runtime's existing concurrency limit. If capacity is unknown, run
  serially.
- Run each implementer as a native sub-agent visible to this session when it honours the
  role's model, effort and working directory (`docs/agents/runtime.md` § Dispatch); otherwise
  dispatch it with `scripts/agent-dispatch.sh IMPLEMENTER <prompt> --effort <medium|high>`
  where you can watch it to completion. Never an unobserved background process. Effort comes from the
  issue's `Complexity`. You may raise it to `high` on evidence — record why on the issue —
  never lower it. The prompt is [`implementer-prompt.md`](implementer-prompt.md), filled.
- Tracker: `In Progress` when you dispatch, `In Review` as soon as you see the PR, `Done`
  after merge and cleanup. Waiting for a human or failed verification stays `In Review`
  with the reason. On resume, reconcile against real PR states before doing anything.
- You own the worktrees of the implementers you dispatch (layout `../<repo>-wt/<issue-id>`,
  verification `../<repo>-wt/<issue-id>-verify`). `Done` after merge and `Canceled`
  both require that issue's worktree and local branch to be gone (an abandoned one with
  unmerged work is archived with a pushed tag first); `scripts/wt-gc.sh` shows what is left.
- If a scope conflict appears mid-flight, pause the conflicting task and re-sequence. Do
  not widen an issue, and do not let two agents produce the same result.

### Verify, then merge (serially)

At every completion claim, check it yourself:

```bash
git fetch origin --prune
gh pr view <N> --repo <owner/repo> --json number,state,baseRefName,headRefName,headRefOid,mergeable,body
git diff --stat origin/<base>...<head-sha>     # scope vs the issue's expected scope
git log --oneline <branch-point>..origin/<base> # what landed on the base meanwhile
```

- Base, head and commits match the issue; the diff stays inside the expected scope; any
  missing artifact or doc section counts as an unmet criterion.
- The required project checks and the relevant issue checks
  (`docs/GIT_WORKFLOW.md` § 2 Implement) are green, and the evidence belongs to the
  **current** head SHA. For ordinary version and bootstrap issues, read the **smoke E2E**
  output (and artifact path) in the PR body; do not ask for full E2E per issue, since the
  **release E2E** runs at the candidate. Governance and hotfix PRs keep their own
  **full E2E** gate. If the base moved in a way that conflicts textually or semantically, the
  implementer updates the branch and reruns the affected checks.
- MERGEABLE/CLEAN proves no textual conflict, nothing more.

Then merge per `docs/GIT_WORKFLOW.md` § Merge authorization, **one PR at a time from the
primary clone**. Do the post-merge cleanup and fan-out. Tracker → `Done`. Human-gated PRs
wait. Rerun a check only if its evidence is missing, the HEAD changed, or you have a
concrete doubt.

Feed forward before the next issue starts. Put anything a later issue depends on (a
measured value, an invalidated design, a trap that cost time) into that issue as a marked
amendment that cites committed evidence. Put a trap in the next prompt directly, and in
`docs/TRAPS.md` if it will outlive the release.

## 3. Release review

Starts when every planned issue is integrated, external dependencies are met, and
`scripts/e2e.sh --release <X.Y.Z>` has passed on the integration branch. Freeze that
commit as candidate **H**. Record the manifest path
(`artifacts/e2e/release/<X.Y.Z>/<H>/manifest.json`) and a one-line summary of each
command's exit code in the orchestration document. No new feature merges into the candidate
branch during review.

Review with `/code-review` in **Standard** mode, or **Deep** when `B...H` touches a
high-risk path (`AGENTS.md` § Merge authorization) or any other path a human must approve.
Every hunter and the verifier is a **fresh** `REVIEWER` dispatch at effort `high`. Give
them B, H, `git diff B...H`, every issue's acceptance criteria, the spec, `docs/REVIEW.md`,
the release E2E manifest and all earlier findings with their fixes. First confirm that
`B..H` contains the claimed work: an empty or partial diff where new work is claimed is a
scope error, not a pass.

| Stage | What happens |
| --- | --- |
| Review 1 | Review H1. No blocking finding → ready. Otherwise → fix batch 1 |
| Fix batch 1 | Fix issues (version fixes in the **same Release**; governance fixes via `dev`, below), implemented and integrated → verified H2 |
| Review 2 | Review `H1..H2` only: is each original finding fixed, and any regression. Blocking → fix batch 2 |
| Fix batch 2 | Same routing → verified H3 |
| Review 3 | Review `H2..H3` only, same checks. Passes → ready. Still blocking → **blocked**, hand to a human |

- **Budget:** at most 3 complete reviews and 2 automatic fix batches. Only a completed
  review of a candidate snapshot counts. An auth failure or empty output is neither a
  pass nor a review and consumes no round: record it and do not retry without end. After
  review 3 there is no fourth round and no unreviewed fix batch. Its open blocking
  findings still get fix issues created or updated.
- **Findings** (ids `R<round>-F<n>`, stable across rounds; schema and states in
  `/code-review` § 4–5): remove duplicates and check each is in scope. Only `confirmed`
  findings are defects; an `unverified` one touching an acceptance criterion blocks until a
  fix or a fresh verifier's evidence-backed refutation resolves it. Never re-open a
  dispositioned finding. Do not close a finding just because the implementer disagrees. A
  real disagreement goes back to a fresh verifier, then to a human. Suggestions do not
  block and do not become tasks automatically. Out-of-scope ones, and `pre-existing`
  findings, go in `docs/DEFERRED_ISSUES.md` with the reason (a `pre-existing` security
  problem blocks). Never relabel a blocking finding as a suggestion.
- **Dispositions:** record every finding's disposition — fixed, refuted, intentional or not
  worth it — in the orchestration document.
- **Fix issues** follow the normal lane rules (`docs/GIT_WORKFLOW.md` § Resolving the base
  branch). Never create a patch Release for a review round.
  - **Version fix** (touches anything outside the carve-out): stays in the **original
    Release** with its `[X.Y.Z]` prefix, and targets the integration branch.
  - **Governance fix** (touches only carve-out files, e.g. `AGENTS.md` or a skill): no
    prefix, no Release, targets `dev`. Record it in the orchestration document as an
    external governance blocker of this release. A version fix that depends on it gets a
    native `blocked-by`. It needs its one independent pre-merge review (**Quick** mode,
    `/code-review`), then fan-out into the integration branch. That moves the candidate,
    which is then re-verified and re-reviewed without resetting the round count.
  - A fix that spans both lanes is split exactly as the lane rules require.

  One fix issue per independent root cause or bug class (findings sharing either may share
  one), built from the standard issue template with complexity. The body carries
  `Review round`, the finding ids, the candidate SHA and the review evidence. Look up the
  existing finding → issue mapping in the orchestration document before creating one;
  retries and resumes must never duplicate. Fixes go implement → PR → handoff → verify →
  merge like any issue. The original issues stay `Done`.
- After each fix batch, run the **release E2E** again on the new candidate
  (`scripts/e2e.sh --release <X.Y.Z>`). A release directory is write-once per version and
  SHA, so each candidate has its own `artifacts/e2e/release/<X.Y.Z>/<H>/manifest.json`.
- **Recurring class:** a confirmed bug class that occurs a second time needs a preventive
  change with a `CHANGELOG.md` entry (`docs/REVIEW.md` § Recurring-class rule).
- **Pass** = no unresolved blocking finding, no open `unverified` finding touching an
  acceptance criterion, and acceptance valid on **that** SHA.
- **Moved HEAD:** if a required fan-out or other authorized change moves the candidate,
  earlier results apply only to the old SHA. The new candidate is verified and reviewed
  again, and the round count does not reset. Once the budget is spent, a human takes over.
- **Reviewer unavailable:** follow `docs/agents/runtime.md` § Reviewer unavailable.
  `REVIEWER_FALLBACK` is eligible only as it defines. If no review can be completed, the
  release is blocked and never advances.

Release ready = the evidence is bound to H. Before declaring it, run `scripts/wt-gc.sh`:
no worktree of this release (implementers', verification, review) may remain, and every
leftover is removed or named with path and reason in the orchestration document. Without
`--through tag`, stop here: merging the integration branch into `dev`, the cut, the `main`
merge, the tag and the publish are human gates (`docs/GIT_WORKFLOW.md`). If that merge
brings a new conflict resolution or code change, verify the merged result and review what
changed. With `--through tag`, continue with § 4.

Record every round in the orchestration document: mode, H, reviewer model and effort,
outcome, the finding → issue map and each finding's disposition.

## 4. Promotion (`--through tag` only)

The authorization, its exclusions and its recorded shape are defined once, in
`docs/GIT_WORKFLOW.md` § 4 *Unattended promotion*. Start only on a passed release review of
the **current** candidate H with `scripts/e2e.sh --release <X.Y.Z>` passed on H, and run the
normal routing (`docs/GIT_WORKFLOW.md` § Two `release/` lifecycles and § Releasing to
`main`). Before each step run its check and put the command and output in the `Decision
log`:

1. **Mandatory human paths.** `git diff --name-only origin/<target>...<source>` must list
   no `.github/workflows/**`, no project release/promotion script and no high-risk path.
   If it does, stop: that step is human-gated.
2. Merge the finished `release/v*` into `dev` (merge commit). Then
   `git diff --quiet <H> <merge-result>` must pass; a difference is a new resolution or
   code change that needs verification and review, so stop.
3. Cut the temporary `release/vX.Y.Z` from `dev` (deleting the merged integration branch of
   that name first), open its PR into `main` at once, require `ci-ok` green (or the
   `CI unavailable` evidence) and MERGEABLE/CLEAN, and merge it with a **merge commit**.
4. Annotated tag `vX.Y.Z`, pushed; GitHub Release for it with English notes and the release
   E2E artifact of H attached (`artifacts/e2e/release/<X.Y.Z>/<H>/`).
5. Linear Release: `commitSha` = `git rev-parse 'vX.Y.Z^{commit}'` and the released stage;
   re-read to confirm.
6. Post-merge cleanup and fan-out (`docs/GIT_WORKFLOW.md` § Post-merge cleanup), then
   `scripts/wt-gc.sh`: remove or name every leftover with path and reason in the
   orchestration document, and report them.

Never run the project's release/promotion scripts and never deploy: both stay with a human.
A hotfix → `main` is never covered.

## When to intervene

Step in for **epistemic risk**, not slow progress:

- a number that looks too good next to the nearest known one;
- a failure being "tolerated" so a run can finish: diagnose it, do not average over it;
- liveness offered as correctness (a process is running ≠ the right build, the right cwd);
- a gate that could pass vacuously (empty diff, empty reviewer output);
- a finding about to be suppressed or clamped so a run completes;
- a fix declared too expensive without evidence.

An implementer waiting on a process you have verified is alive needs a sentinel
(`until ! kill -0 <pid>; do sleep 15; done`), not a prompt. An implementer that yielded
with an accurate statement of remaining work needs a resume. Treat your own claims as
checkable too, and tell implementers to verify them.
