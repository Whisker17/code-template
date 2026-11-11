---
name: to-spec
description: Turn the current conversation into a spec — no interview, just synthesis of what has already been discussed. Fills the numbered docs/DESIGN.md skeleton by default; publishes only as the user directs.
disable-model-invocation: true
---

This skill turns the current conversation and your understanding of the codebase into a spec (you may know it as a PRD). Do NOT interview the user — synthesize what you already know. Use `/grill-me` first if the goal, constraints or acceptance are still unclear.

Explore the repo first if its current state is not already known. Use the project's domain
glossary vocabulary (`docs/agents/domain.md`) and respect relevant ADRs. Identify the
highest existing seam that can verify the external behaviour; prefer one shared seam over
several new ones. Carry previously agreed testing decisions into the draft. If a new seam
needs a user decision, resolve it with `/grill-me` before continuing.

## Project spec (default): `docs/DESIGN.md`

`docs/DESIGN.md` is the spec of record, and its numbered sections are stable references. Issues cite `§2.x`, `[Component]` comes from `§4.2`, milestones from `§6`, and agents check `§7` and `§8` (`AGENTS.md`, `docs/agents/issue-template.md`, `docs/agents/domain.md`). So:

- Read the existing file and fill its sections **in place**. Never replace it with another layout, and never renumber its sections.
- Replace each _(fill in)_ guidance with content, following the guidance.
- Delete a section only where the file itself says it may be deleted. Keep §7 and §8 even when short.
- When updating an existing spec, change the affected sections only. Keep `§` numbers stable: add new subsections at the end of a section, and never reuse a deleted number.

Where things go:

- Goal, scope, non-goals and overall success criteria → §1.
- Each requirement goes in §2 as a numbered subsection, with an objectively checkable acceptance condition and how it will be verified. Prefer external behaviour and existing test seams, and name the smallest check that would catch a real failure. Any tunable parameter cites its source.
- Architecture and interfaces → §4. Keep the module layout in §4.2 in step with `AGENTS.md` § Architecture.
- Rejected options → §7. Risks and open questions → §8.

Avoid file paths and code snippets, which go stale. The exception is a prototype snippet that pins a decision (a state machine, a schema, a type shape): trim it to the decision-rich part.

## Template or tooling spec

A spec about the template or tooling itself goes in its own document under `docs/references/`, never over `docs/DESIGN.md`. Its headings are free. It must still state the problem, the requirements with acceptance, the decisions, what is out of scope, and the risks.

## Design review (mandatory, before any write)

Draft the spec in the conversation first. Write nothing — not `docs/DESIGN.md`, not the tracker — until the review below ends.

1. Dispatch `REVIEWER` with `scripts/agent-dispatch.sh REVIEWER <prompt-file> --effort high`, in a fresh context. The prompt carries the draft, the source discussion and the repo docs it touches (`docs/DESIGN.md`, `docs/adr/`, `docs/agents/domain.md`). Ask for blocking issues and suggestions only: gaps, contradictions, unverifiable acceptance, unstated decisions.
2. Address each finding: change the draft, or record why not. Re-dispatch with the revised draft and the previous findings, so the next round checks the diff.
3. **At most 3 rounds.** Whatever is still disputed goes into the draft's "Open questions" (§8 for the project spec). After round 3 the owner decides those; do not start a fourth round.
4. Record the consensus — rounds, what changed, open disagreements, reviewer role/model/effort — in a Linear project document (for a release, a "Design review" section of the Release orchestration document; see `docs/agents/issue-tracker.md` § Release orchestration document). If it cannot be written, stop and say so.
5. **Only then write** the spec.

If `REVIEWER` is unavailable, follow `docs/agents/runtime.md`; do not substitute a model or review your own draft.

## Publishing

Publish to the tracker (`docs/agents/issue-tracker.md`) only as the user instructs. Do not create a ready-for-agent issue by default: tickets come from `/to-tickets`.
