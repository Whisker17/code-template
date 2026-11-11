---
name: handoff
description: Compact the current work into a short handoff for another agent or session, pointing at durable evidence instead of restating it.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff so a fresh agent can continue the work. Save it in the OS temporary
directory (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows), or the output path your caller
binds, not in the workspace. Report the saved document's absolute path.

A temporary handoff is a courier, never the only record. Before writing it, make sure the facts a resume depends on already live somewhere durable: the PR body or issue comments for issue-level results, and the `Release X.Y.Z — orchestration` document (`docs/agents/issue-tracker.md`) for release-level state (baseline B, round, reviewed SHAs, finding → fix mapping).

Include only:

- issue, spec, PR, branch and worktree links/paths, and the resolved base;
- the current commit SHA and what it implements;
- acceptance commands, their actual results, and artifact locations;
- open questions, failed or not-run checks, and the next step;
- effects on dependent tasks, with evidence for any corrected conclusion;
- the role, model and effort actually used;
- suggested skills for the next session, naming the exact invocation and its purpose.

Reference specs, plans, issues, commits and diffs by path or URL; do not copy them. Redact secrets and personal data.

## Next-session prompt

End the handoff with one fenced block the owner can paste, unedited, into a fresh session. The
fresh session has no memory of this one, so the block must stand alone. It carries every field
below; write `none` for a field that does not apply, never omit it:

- **Repo:** absolute path of the repo (primary clone) and the worktree path, if any.
- **Ids:** Release (`X.Y.Z`) and the issue ids in play.
- **State:** current commit SHAs (branch head, base head) and PR numbers with their status.
- **Invocation:** the exact skill call to run first (for example `/orchestrate 0.3.0 --through tag`,
  `/implement <ISSUE>`), or the first command if no skill applies.
- **Stop conditions:** when to stop and hand back to the owner (human gates, failed required
  checks, an unapproved decision, an unavailable role).
- **Evidence:** where the durable facts live (Linear issue and `Release X.Y.Z — orchestration`
  document, PR bodies, artifact paths), so the session reads them instead of trusting this prompt.

The block names the next action in one sentence the fresh session can act on without asking a
question. If it cannot, a fact is missing: fetch it first and put it in the block.

If the user passed arguments, treat them as what the next session will focus on and tailor the handoff to that.
