# Review standard

What `/code-review` reviews against. Every hunter and the verifier get this file in their
prompt. The procedure is `.claude/skills/code-review/SKILL.md`; this file defines what
counts as a failure, how a report looks, and keeps the record of what review missed.

## What counts as failure (blocking)

A finding is **blocking** only if it is one of these, confirmed by the verifier:

- **Docs lie.** A doc, skill, comment or help text states something the code or repo does
  not do: a path, command, flag, role, base branch or number that is wrong.
- **Config misroutes.** A value sends work to the wrong place: wrong base branch, role,
  model, version, or a gate that fails open.
- **Acceptance not met.** An acceptance criterion in scope does not hold on the reviewed
  SHA, or its verification would still pass with the change reverted.
- **Data loss.** A path that drops, duplicates, overwrites or corrupts records or files.
- **Security.** Untrusted input reaches a path, a command, a query or a secret.

Anything else is at most a `suggestion`.

## Nit limits

- Style, naming, wording and formatting preferences are **dropped**, not reported. A linter
  owns formatting.
- At most **5** suggestions are listed per report, one line each; the rest are counted only.
- Never relabel a blocking finding as a suggestion to get a pass, or the reverse.
- A suggestion never becomes a task by itself.

## Ignored paths

Generated and vendored files are checked only for whether they match their source, not
read line by line: `artifacts/`, `uv.lock`, `skills-lock.json`, `.claude/skills/answer-me-with-html/scripts/am.mjs`
(built from that skill's `dev/`).

## Output format

Counts first, then findings, each with `file:line`. The exact header is in `/code-review` § 5.

```text
Review R1 · mode Standard · range B...H · head <full SHA>
Counts: 2 confirmed (1 blocking, 1 suggestion, 0 pre-existing), 1 refuted,
        0 unverified (0 touching an acceptance criterion), 1 dropped as style
1 blocking finding.
Verdict: BLOCKED (R1-F1)

R1-F1 · blocking · bug class: off-by-one in batching · src/export.py:42
  Trigger:     250 records, batch size 100
  Evidence:    `python -c ...` returns 200 records, 50 dropped
  Violates:    AC2 "every record is sent exactly once"
  Smallest fix: loop to `len(records)`, not `len(records) - size + 1`
R1-F2 · suggestion · ...
```

Refuted findings are listed under the report with their refutation, so nobody re-raises
them. An `unverified` finding touching an acceptance criterion is shown open and keeps the
verdict at BLOCKED.

## Escapes

A bug that shipped past review: found after a release, or fixed by a hotfix. **Every
hotfix and every post-release bug gets a row**, added in the PR that fixes it. "Angle" is
the `/code-review` angle that should have caught it.

| Commit | Bug | Bug class | Angle that should have caught it | Fixed in |
| --- | --- | --- | --- | --- |
| _(none recorded)_ | | | | |

### Replay rule

When the `REVIEWER` model (`config/agent-roles.conf`) or the review skill
(`.claude/skills/code-review/SKILL.md`) changes, replay every escape before relying on the
new setup: for each row, review the range `<parent of Commit>...<Commit>` in the mode that
would have applied, and count a row as *caught* if a confirmed blocking finding names the
bug. Record `recall = caught / total`, the model and the skill revision in `CHANGELOG.md`.
A change that lowers recall needs a stated reason.

### Recurring-class rule

When a confirmed **bug class** occurs a second time — as two escapes, or as a confirmed
finding in a later review of the same class — the fix of the second occurrence must also
carry one **preventive change**: a lint or E2E check, an `AGENTS.md` rule, a `REVIEW.md`
rule or a skill change, with a `CHANGELOG.md` entry that cites both occurrences. A bug fix
alone does not close the second occurrence.

## Recurring bug classes

| Bug class | Occurrences | Preventive change | CHANGELOG entry |
| --- | --- | --- | --- |
| _(none recorded)_ | | | |

**Worked example** (illustrative; not a recorded entry). A doc names a base branch that the
code never resolves, twice:

| Escapes row | Commit | Bug | Bug class | Angle |
| --- | --- | --- | --- | --- |
| 1 | `a1b2c3d` | `release.md` says PRs target `dev`; the routing table targets `release/v1` | doc names a hardcoded base | Spec & acceptance |
| 2 | `e4f5a6b` | `onboarding.md` repeats the hardcoded `dev` | doc names a hardcoded base | Spec & acceptance |

The second row triggers the rule. Its fix commit also lands this row in the table above
and this entry in `CHANGELOG.md`:

| Bug class | Occurrences | Preventive change | CHANGELOG entry |
| --- | --- | --- | --- |
| doc names a hardcoded base | `a1b2c3d`, `e4f5a6b` | smoke E2E greps `docs/` for a literal base branch outside `docs/GIT_WORKFLOW.md` | "Smoke E2E rejects a hardcoded base branch in docs (second occurrence of 'doc names a hardcoded base': `a1b2c3d`, `e4f5a6b`)." |
