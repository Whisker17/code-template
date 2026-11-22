# Triage Labels

Skills speak in terms of five canonical triage roles. This file maps those roles to the
actual label strings used in this repo's issue tracker (Linear or GitHub labels).

| Canonical role             | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

## The `hotfix` label (routing, not triage)

`hotfix` is a **type** label, not one of the five triage roles, but it is the one type
label that changes git behaviour: an issue labelled `hotfix` branches off `origin/main`
and targets `main` (see `docs/GIT_WORKFLOW.md` § Resolving the base branch). Without
this label, version-scoped work targets `release/v{version}` and only repo-wide
governance targets `dev`. Agents **must resolve the base before creating the
worktree** — never assume `dev`.

Apply it only when production is actually broken *and* `dev` holds work that must not ship
yet. If everything on `dev` is shippable, the fix rides a normal release instead.

These are **issue labels** in either tracker; `docs/agents/issue-tracker.md` says how to find
and create one. Create any missing label before applying it. Lifecycle (open → done) is
tracked separately — by workflow states in Linear, by the state labels `todo` / `in-progress` /
`in-review` (and open/closed) on GitHub — so these labels layer the triage role on top of
whatever state the issue is in.

On GitHub, SETUP also creates `governance`, `backlog`, `orchestration`, `needs-design` and
`hotfix` next to the state and triage labels above.

## High-risk-path extra caution (this repo)

Treat any issue touching **{{HIGH_RISK_PATHS}}** as **never** `ready-for-agent` by
default — route it to `ready-for-human` unless the issue explicitly says otherwise and a
human has reviewed the plan first.
