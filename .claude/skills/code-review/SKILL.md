---
name: code-review
description: Multi-angle adversarial review of a fixed range (a PR, or a release snapshot B..H) by fresh-context REVIEWER dispatches - parallel bug hunters plus an independent verifier. Reports only verified findings and a verdict tied to the reviewed SHA.
---

Fresh-context reviewers try to **break** a fixed range, then a separate fresh reviewer
tries to **refute** what they found. Only what survives refutation enters the report. No
reviewer edits the code under review. What counts as a failure, the nit limits and the
output format are in `docs/REVIEW.md`; this file is the procedure.

## Modes

The caller picks the mode. The names are the same in `/orchestrate` § Release review and
`/implement` § Merge.

| Mode | Used for | Hunters | Verifier | Precondition on the head |
| --- | --- | --- | --- | --- |
| **Quick** | governance PRs, standalone `/implement`, hotfix | 1 hunter covering all six angles | 1 | **Full E2E** (`scripts/e2e.sh --full`) passed on the final head. Never a release artifact |
| **Standard** | a release candidate | 1 hunter per angle (six) | 1 | **Release E2E** manifest passed on H (`artifacts/e2e/release/<X.Y.Z>/<H>/manifest.json`) |
| **Deep** | a release candidate touching high-risk paths (`AGENTS.md` § Merge authorization) or any other path a human must approve | 2 hunters per angle (twelve); one of each pair may be another vendor | 1 | Same as Standard |

A hunter or verifier dispatch is one *review step* in the sense of `docs/agents/runtime.md`
§ Reviewer unavailable. "Another vendor" is optional and is not `REVIEWER_FALLBACK`, which
exists only for a failed primary call.

## 1. Pin the range

- **PR range (Quick):** fixed point = the PR base (or the ref the user names); head = the
  PR's head commit.
- **Release range (Standard, Deep):** baseline **B** and candidate **H**, from the
  `Release X.Y.Z — orchestration` document (`/orchestrate` § Release review).

Commit everything first. Resolve both ends (`git rev-parse`) and record the exact SHAs.
Use the three-dot form `git diff <fixed>...<head>` (against the merge-base; for B..H,
where B is an ancestor, it equals the plain range). Two-dot against a base that has moved
shows foreign commits in reverse. Check that the diff is **non-empty and contains the work
being claimed**. Then check the mode's precondition above: the artifact exists for exactly
this head, its manifest records exit code `0` for every command, and its SHA equals the head.
A bad ref, an empty diff, a diff missing the claimed work or a missing precondition stops
here — it is never a pass.

## 2. Gather the inputs

- The diff (inline it in every prompt; do not rely on the reviewer running git) and the
  commit list. A reviewer may read the full tree at the head to check interactions.
- The spec and **every** acceptance criterion in scope: the PR's issue, or every issue in
  the Release. Fetch them via `docs/agents/issue-tracker.md`, including comments and
  amendments. For an ad hoc range, look for issue references in commit messages, a path the
  user supplied, then a matching spec under `docs/` or `specs/`. If no source is found, ask
  the user. If they confirm none exists, explicitly report "no spec available"; do not
  invent acceptance criteria or waive the lane's required issue acceptance.
- The verification artifacts (commands, results, logs, the manifest) and, in later
  rounds, the findings so far with their dispositions.
- `docs/REVIEW.md` and **every** file documenting coding standards. Search the tree;
  include `CONTRIBUTING.md` and `CODING_STANDARDS.md` wherever present, plus applicable
  agent instructions. Give reviewers the source list so a documented violation can cite
  its file and rule.

Carry two explicit axes through the hunt and report: **Standards** (documented repo rules)
and **Spec** (missing, partial, incorrect or unrequested behaviour). Assess each separately
so one passing axis cannot hide a failure in the other; keep the verified finding ids and
combined blocking verdict of § 5.

For Standards, also pass this Fowler smell baseline to the hunter covering simplicity.
Each is a **possible** smell, a judgement call, never a hard violation. Repo rules override
it; skip checks already enforced by tooling. Do not create an abstraction merely to remove
a smell: `/ponytail` and actual requirements decide whether a change helps.

| Possible smell | Look for; smallest useful remedy |
| --- | --- |
| Mysterious Name | A name hides its purpose; rename it clearly. |
| Duplicated Code | Repeated logic; reuse the shared shape when warranted. |
| Feature Envy | Logic mostly uses another object's data; move it nearer that data. |
| Data Clumps | The same fields travel together; consider one domain type. |
| Primitive Obsession | A primitive obscures a domain concept; consider a small domain type. |
| Repeated Switches | Repeated dispatch on the same type; consider one shared map or polymorphism. |
| Shotgun Surgery | One change scatters edits; gather what changes together. |
| Divergent Change | A module changes for unrelated reasons; separate responsibilities. |
| Speculative Generality | Unrequested hooks or abstractions; delete them. |
| Message Chains | Callers navigate internals; hide the walk behind a useful operation. |
| Middle Man | A wrapper only delegates; call the target directly. |
| Refused Bequest | An implementation discards most inherited behaviour; consider composition. |

Baseline smells remain `suggestion` only after verification. Pure style findings are still
dropped under § 4; a documented breach blocks only if it meets `docs/REVIEW.md`'s failure
definition.

## 3. Hunt

Dispatch each hunter with `scripts/agent-dispatch.sh REVIEWER <prompt-file> --effort high`,
or a native sub-agent that honours the same model and effort (`docs/agents/runtime.md`).
Every dispatch is its own **fresh context**, never the implementing one, and no hunter sees
another hunter's output. Hunters may run concurrently up to the runtime's limit, else
serially.

Every hunter prompt starts: **"Assume a bug exists in this change. Find inputs, states and
sequences that break it."** It names the angle(s), carries the inputs of § 2, and asks for
candidate findings in the schema of § 5 with a concrete trigger each. Breadth over
certainty: a hunter reports every plausible failure it can articulate and says whether it
reproduced it; deciding is the verifier's job (§ 4). The angles:

1. **Spec & acceptance.** Does each acceptance criterion hold? Find missing, partial,
   incorrect and unrequested behaviour, citing the spec for each finding.
   If no spec is available under § 2, report that this axis was skipped.
2. **Failure paths.** Errors, recovery, concurrency, data loss.
3. **Security & trust boundaries.** Untrusted input, paths, secrets, permissions.
4. **Cross-issue integration.** Interfaces, config, schema and generated files that two
   changes both touch.
5. **Verification validity.** Would the E2E still pass with the feature reverted? Is the
   artifact reproducible from its manifest? Is any gate vacuous?
6. **Simplicity & standards** per `/ponytail`: documented-rule violations, the smell
   baseline in § 2, existing capability re-implemented, an unneeded dependency or
   abstraction. Simplicity and baseline-smell findings are `suggestion` only; documented
   violations use the failure definition in `docs/REVIEW.md`.

Quick gives one hunter all six angles. Deep gives each angle to two hunters.

A hunter's reply is its candidate findings, or an explicit "no findings" with the checks
it made. **A failed or empty dispatch is not a review** (§ 6).

## 4. Verify

The caller concatenates the hunters' candidates verbatim, merges exact duplicates (keeping
the source hunters), and gives each remaining candidate its id `R<round>-F<n>`. A **new**
fresh `REVIEWER` dispatch — not one of the hunters — receives the numbered list, the diff,
the spec and `docs/REVIEW.md`, and tries to **refute each finding** by reproduction (run
it) or code citation, reading whatever it needs in the tree at the head. It returns one
disposition per id, with the evidence:

- `confirmed` — reproduced, or the cited code provably violates the requirement;
- `refuted` — the trigger cannot happen, the code is correct, or the requirement is met;
- `unverified` — it could neither reproduce nor refute (evidence thin, or it depends on
  something outside the repo).

The verifier adds nothing new. A candidate it judges style-only is dropped, not reported.
Only `confirmed` findings enter the report as defects; `refuted` are listed with their
refutation so nobody re-raises them.

`git blame` on the cited line decides `pre-existing`: the line's commit is an ancestor of
the fixed point / B, so the range did not introduce it.

## 5. Findings and report

Each finding has: id `R<round>-F<n>` (assigned once; **stable across rounds**), severity,
bug class (a short noun phrase, reused for the same kind of bug), `file:line`, trigger,
reproduction or evidence, the violated requirement, and the smallest fix. Severity:

- **blocking** — a confirmed failure as defined in `docs/REVIEW.md`: a defect, an unmet
  acceptance criterion, missing critical verification, a security or data problem;
- **suggestion** — confirmed but optional (including every simplicity finding). Never
  blocks, never becomes a task by itself;
- **pre-existing** — confirmed, but `git blame` shows the range did not introduce it. Goes
  to `docs/DEFERRED_ISSUES.md`; non-blocking unless it is a security problem.

`unverified` is a disposition, not a severity. It **blocks while open when it touches an
acceptance criterion in scope** (every listed criterion counts; one the spec marks optional
does not). Otherwise it is reported and does not block.

The report opens with the counts and an explicit statement, then the findings:

```text
Review R<round> · mode <Quick|Standard|Deep> · range <fixed>...<head> · head <full SHA>
Counts: <C> confirmed (<b> blocking, <s> suggestion, <p> pre-existing), <r> refuted,
        <u> unverified (<k> touching an acceptance criterion), <d> dropped as style
No blocking findings.   |   <N> blocking finding(s).
Verdict: PASS | BLOCKED (<why>)
```

**Pass** = no confirmed blocking finding, no open `unverified` touching an acceptance
criterion, and the precondition of § 1 valid on **that** SHA. Suggestions may remain. An
open `unverified` is shown as open and is never rendered as PASS; it clears only by a
fix, or by a fresh verifier call that refutes it with evidence in a later round. A later
commit needs its own check.

After the counts and verdict, report **Standards** and **Spec** separately, each with its
counts and worst finding (or explicit "no findings" / "no spec available"). Reference the
stable finding ids rather than duplicating findings. Keep other defect angles visible in
the report too. Neither axis passing overrides a blocking finding on the other.

## 6. Rounds

- **Complete review.** A round counts only when every hunter of the mode and the verifier
  returned usable output and every id has a disposition. A failed dispatch (non-zero
  exit, exit `2`/`3`, a transport error, empty output) means **no review happened**: record
  the role, exit code and error, follow `docs/agents/runtime.md` § Reviewer unavailable, and
  leave the round counter unchanged. Never report a pass from it.
- **Budget:** at most 3 complete reviews and 2 automatic fix batches. In a release the
  counts live in the orchestration document (`/orchestrate` § Release review); for a Quick
  review, on the PR.
- **Rounds 2–3** run the same mode on `H_prev..H_new` **only**, plus two checks per earlier
  finding and for regressions: is each earlier `confirmed` or `unverified` finding fixed,
  and did the fix break anything. Findings keep their ids. A `refuted` or otherwise
  dispositioned finding is never re-opened; only a new reproduction on new code can raise
  a new finding, with a new id `R<round>-F<n>`. Hunters get the earlier findings with their
  dispositions and may restate them; the caller maps a restatement to the existing id, never
  to a new one. The verifier is given the fixed-claims as a separate list and answers
  `status: fixed | not fixed` (a status, not a disposition), and re-checks an `unverified`
  finding when the delta adds evidence for it.
- **Fix issues:** one per root cause or bug class, not per finding.
- **Dispositions:** every finding ends as `fixed`, `refuted`, `intentional` or `not worth
  it`, recorded in the orchestration document (release) or the PR (Quick).
- A second occurrence of a confirmed bug class triggers the preventive-change rule of
  `docs/REVIEW.md`.

The caller — the orchestrator, or the implementer in standalone mode — removes duplicates
and checks scope. A finding is not closed just because the implementer disagrees; a real
dispute goes back to a fresh verifier, then to a human.
