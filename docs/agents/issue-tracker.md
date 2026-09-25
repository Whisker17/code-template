# Issue tracker: Linear

Issues and PRDs for this repo live in **Linear**, project **"{{LINEAR_PROJECT}}"**, team
`{{LINEAR_TEAM}}`.

## How to reach Linear

Tracker state moves in lockstep with the PR (below), so this access path is **mandatory,
not a convenience** — a runtime that cannot reach the tracker cannot complete the git
workflow. Take the first rung of this ladder that your runtime actually offers:

1. **Linear MCP tools.** In this template's reference setup they are exposed via the
   `slim-tools` gateway rather than as top-level tools:
   - Discover the tool you need:
     `discover_tools({ query: "linear <capability>", detail: "typescript" })`
     (e.g. `"linear create issue"`, `"linear list issues"`, `"linear comment"`).
   - Call it from `execute_code` using the returned `codeApi.path`. Aggregate/filter in
     the sandbox; return only the final shape.

   If your runtime has the Linear MCP server mounted directly, the tool names below apply
   without the gateway indirection.
2. **Linear GraphQL API** over plain HTTP, with `LINEAR_API_KEY` from `.env`. Every
   operation named below exists as a GraphQL mutation/query (`issueCreate`,
   `issueUpdate`, `commentCreate`, `issues`, `workflowStates`). Use this when your runtime
   has shell/network access but no MCP.
3. **Neither available:** stop and report the step as blocked. Do **not** switch to a
   local-markdown tracker or `gh issue` — the tracker is shared state, and a divergent
   shadow copy is worse than an honest block. A project that genuinely uses another
   tracker replaces **this file** with a binding for it, so every skill agrees on where
   issues live. That binding must define the same operations, including
   [§ Release ↔ version binding](#release--version-binding) (or declare that it has no
   release entity — git routing reads that section) and
   [§ Release orchestration document](#release-orchestration-document).

Verify every operation you rely on — Release lookup, issue ↔ Release binding, native
relations, documents — against the target workspace's actual tools or API before depending
on it. Do not guess from a field name. A write you could not confirm is reported as not
done.

The rest of this file names Linear MCP tools (namespace `linear`); under rung 2, read each
as its GraphQL equivalent. Core tools:

- **Create / update an issue**: `linear.save_issue({...})`. When creating, `title` and
  `team` are required; also set `project` to `"{{LINEAR_PROJECT}}"` so it's scoped
  correctly. Omit `id` on create; pass `id` to update. Use `assignee` (a user id, name,
  email, or `"me"`) — not `assigneeId`. Set labels via the `labels` field (see
  `triage-labels.md` for the canonical strings).
- **Read / list issues**: `linear.list_issues({...})`. Filter by `assignee`
  (`"me"` / `"null"`), team, project, state, or label. For a single issue, list with the
  id/filter and read the returned record.
- **Comment**: `linear.save_comment({ issueId, body })` to start a thread;
  `linear.save_comment({ parentId, body })` to reply. Read with
  `linear.list_comments({ issueId })`.
- **Labels**: `linear.list_issue_labels({...})` to find existing labels;
  `linear.create_issue_label({...})` to create a missing one.
- **Workflow states**: `linear.list_issue_statuses({ team })` — Linear tracks progress
  as workflow states in addition to labels. Move an issue by setting its `state` via
  `linear.save_issue`.
- **Close**: set the issue's `state` to a completed/canceled workflow state via
  `linear.save_issue`, optionally after a `linear.save_comment` explaining why.

Prefer Linear's native **workflow states** for lifecycle (open → done) and **labels**
for the triage roles in `triage-labels.md`.

## Issue lifecycle ↔ Git (mandatory)

Implementation always uses a **git worktree** off the **resolved base** (see
`docs/GIT_WORKFLOW.md` — version-scoped work targets `release/v{version}`,
governance targets `dev`, hotfix targets `main`). Agents must keep Linear
state in lockstep with the PR:

| When | Linear `state` |
| --- | --- |
| Claimed, implementation started | `In Progress` |
| PR opened against the resolved base | **`In Review`** |
| PR merged into the resolved base and the required cleanup (and fan-out) done | **`Done`** |
| Waiting for a human, or verification failed | stays **`In Review`**, reason in a comment |
| Abandoned | `Canceled` |

**Who moves it.** Under `/orchestrate` the orchestrator owns every transition; implementers
return facts and PR links. In standalone `/implement`, the implementing agent owns them.
`Done` means merged, not released.

Do not mark `Done` when the PR is only opened, or because an agent reported it finished.
Do not leave an open PR in `In Progress`. If a PR opened before the orchestrator heard
about it, sync the state as soon as it does. On resume, read the real PR state first and
repair drift — never re-create or re-merge a PR. Triage labels (`ready-for-agent`, etc.)
stay orthogonal to these states.

## Release ↔ version binding

`docs/GIT_WORKFLOW.md` § Version determination resolves a version-scoped issue's
base branch from two signals: the `[X.Y.Z]` title prefix (primary) cross-checked
against **this tracker's release entity**. That entity is tracker-specific, so it
is defined here.

**For Linear, the release entity is the issue's `Release` field.** Sharp edges,
all of which have already caused a real mis-resolution in the source project
(`mantle-stocks-arbitrage-bots`, WHI-1097):

- **`Release` is not `projectMilestone`.** Both render as a bare `X.Y.Z` in the
  UI and in API payloads, and reading the milestone as the Release let a title
  prefix of `[0.2.0]` sit against a milestone of `0.3.0` undetected for days.
  Milestone is *capability stage*; Release is *when it ships* and what routes
  git (`docs/GIT_WORKFLOW.md` § Version axis).
- **Linear does not enforce non-empty fields.** `issue-template.md`'s metadata
  table asks for a Release, but nothing rejects an issue without one — several
  shipped with the field empty. The enforcement is the agent's **refusal**, not
  the tracker.
- **Read it through the same access ladder as everything else** (above): via MCP,
  `discover_tools({ query: "linear issue release", detail: "typescript" })` then
  the returned `codeApi.path` from `execute_code`; under rung 2, the GraphQL
  `issue` query — select the release/version field explicitly and confirm you did
  not select the milestone by accident. If the tracker is unreachable, the
  cross-check has not been performed: say so and stop, rather than proceeding on
  the title prefix alone as though both signals had agreed.

**Swapping trackers:** an alternative binding (`issue-tracker-github.md` /
`-gitlab.md` / `-local.md`) must define this section too — naming its own release
entity and how to read it — or state explicitly that it has **no** release
entity, which drops the cross-check per `docs/GIT_WORKFLOW.md` § Version
determination and leaves the title prefix standing alone. A missing or ambiguous
prefix still refuses.

## Pull requests as a triage surface

**PRs as a request surface: no.** Code review happens on GitHub; the Linear queue is not
fed from pull requests.

## When a skill says "publish to the issue tracker"

Create a Linear issue with `linear.save_issue` (`title` + `team` required, `project` set
to `"{{LINEAR_PROJECT}}"`). Follow the canonical structure in
`docs/agents/issue-template.md` — title convention, body sections, and acceptance
criteria. All issue content is written in English.

## Publishing ticket sets (e.g. from `/to-tickets`)

When a skill produces a **set** of tickets with blocking edges, publish them to Linear
like this:

1. **Order**: create issues in dependency order — blockers first — so each later issue
   can reference real identifiers.
2. **Blocking edges**: wire them as Linear's native **`blocked-by` / `blocks`
   relations** (via `linear.save_issue`'s relations support, or the dedicated relation
   tool if `discover_tools` surfaces one — query `"linear issue relation"`). Also mirror
   each edge as a human-readable `## Blocked By` line in the body per
   `issue-template.md`; the native relation is the source of truth, the body line is the
   mirror.
3. **Scoping**: every issue gets `project: "{{LINEAR_PROJECT}}"` and, if the
   set belongs to a version, the matching **Release** (title carries the `[X.Y.Z]`
   prefix per `issue-template.md`). Milestone is orthogonal — attach it when the
   set is a capability stage, but do not put it in the title.
4. **State + labels**: state `Todo`, triage label `ready-for-agent` (unless the user
   says otherwise) — the tickets are agent-grabbable by construction.
5. **Body**: use the copy-paste skeleton in `issue-template.md`, including a filled
   `## Execution` section (one complexity value, reason, expected scope).

## When a skill says "fetch the relevant ticket"

Read it with `linear.list_issues` (filter to the id/identifier), then pull discussion
with `linear.list_comments({ issueId })`.

## Reading a release

`/orchestrate` works from an explicit project and Release — never a similar title or a
milestone. Read **every page** of the Release's issues with: state, Release, native
`blocks` / `blocked-by` relations, the `## Execution` section, acceptance criteria and
comments/amendments. Native relations are the dependency source of truth; the body lines
mirror them — fix whichever is wrong before scheduling.

## Release orchestration document

Release-level state lives in **one** Linear project document named
`Release X.Y.Z — orchestration`, reused for the whole release (never one per round) and
linked from the issues it concerns. It records:

- workflow contract version (`v0.2`), and which issues, if any, started under an older one;
- the planned issue set, the fixed review baseline **B** and the integration branch;
- each review round: candidate SHA **H**, reviewer role/model/effort, outcome;
- every finding id → the fix issue that owns it (or its disposition), including
  governance fixes tracked as external blockers (no Release, routed to `dev`);
- current blocker, if any.

Find the document tools with
`discover_tools({ query: "linear document", detail: "typescript" })` (GraphQL:
`documentCreate` / `documentUpdate` / `documents`). Search for the existing document before
creating one. If documents cannot be written, say so and stop the step that needed it —
do not keep the state only in chat or a temp file.
