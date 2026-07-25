# Issue tracker: Linear

Issues and PRDs for this repo live in **Linear**, project **"{{LINEAR_PROJECT}}"**, team
`{{LINEAR_TEAM}}`. Skills reach Linear through the **Linear MCP tools**, which are
exposed via the `slim-tools` gateway rather than as top-level tools.

## How to call Linear

1. Discover the tool you need:
   `discover_tools({ query: "linear <capability>", detail: "typescript" })`
   (e.g. `"linear create issue"`, `"linear list issues"`, `"linear comment"`).
2. Call it from `execute_code` using the returned `codeApi.path`. Aggregate/filter in
   the sandbox; return only the final shape.

Core tools (namespace `linear`):

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

Implementation always uses a **git worktree** off latest `dev` (see
`docs/GIT_WORKFLOW.md`). Agents must keep Linear state in lockstep with the PR:

| When | Linear `state` |
| --- | --- |
| Claimed / coding in worktree | `In Progress` |
| PR opened against `dev` (awaiting review) | **`In Review`** |
| PR squash-merged into `dev` | **`Done`** |
| Abandoned | `Canceled` |

Do not mark `Done` when the PR is only opened. Do not leave an open PR in `In Progress`.
Triage labels (`ready-for-agent`, etc.) stay orthogonal to these states.

## Pull requests as a triage surface

**PRs as a request surface: no.** Code review happens on GitHub; the Linear queue is not
fed from pull requests. `/triage` processes Linear issues only.

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
3. **Scoping**: every issue gets `project: "{{LINEAR_PROJECT}}"` and, if the set belongs
   to a milestone, the matching milestone attachment (title carries the `[Mn]` tag per
   `issue-template.md`).
4. **State + labels**: state `Todo`, triage label `ready-for-agent` (unless the user
   says otherwise) — the tickets are agent-grabbable by construction.
5. **Body**: use the copy-paste skeleton in `issue-template.md`, not the skill's generic
   local-file template.

## When a skill says "fetch the relevant ticket"

Read it with `linear.list_issues` (filter to the id/identifier), then pull discussion
with `linear.list_comments({ issueId })`.
