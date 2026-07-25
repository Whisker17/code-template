# Template Changelog

Improvements to the template layer, newest first. When a downstream project ports a
change back (see "Template feedback loop" in `AGENTS.md`), record it here so other
projects can pick it up deliberately.

Format: date — what changed and why — which project surfaced it (if any).

---

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
