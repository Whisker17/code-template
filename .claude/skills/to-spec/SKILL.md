---
name: to-spec
description: Turn the current conversation into a spec — no interview, just synthesis of what has already been discussed. Writes docs/DESIGN.md by default; publishes only as the user directs.
disable-model-invocation: true
---

This skill turns the current conversation and your understanding of the codebase into a spec (you may know it as a PRD). Do NOT interview the user — synthesize what you already know. Use `/grill-me` first if the goal, constraints or acceptance are still unclear.

## Where it goes

- A project's spec of record is **`docs/DESIGN.md`** (`docs/agents/domain.md`).
- A spec about the template or tooling itself goes in its own document under `docs/references/`, never over `docs/DESIGN.md`.
- Publish it to the tracker (`docs/agents/issue-tracker.md`) or not, as the user instructs. Do not create a ready-for-agent issue by default: tickets come from `/to-tickets`.

## Process

1. Explore the repo if you haven't already. Use the spec's domain vocabulary and respect any ADRs in the area.
2. Decide how the result will be verified. Prefer external behaviour and existing test seams; name the smallest checks that would catch a real failure. Confirm them with the user if that was not already settled.
3. Write the spec with the sections below. Keep it as long as the decisions need and no longer.

<spec-template>

## Problem Statement

The problem, from the user's perspective.

## Solution

The solution, from the user's perspective.

## Requirements and acceptance

The capabilities required, each with an objectively checkable acceptance condition. Use user stories only where they clarify who needs what.

## Implementation Decisions

The decisions made: modules built or changed and their interfaces, architecture, schema, API contracts, notable interactions, and clarifications from the developer. Avoid file paths and code snippets, which go stale. The exception is a prototype snippet that pins a decision (a state machine, a schema, a type shape): trim it to the decision-rich part.

## Testing Decisions

What will prove the requirements: which behaviour gets checked, at which seam (module tests, E2E, or both), and the prior art in the codebase. Test external behaviour, not implementation details.

## Out of Scope

What this spec deliberately does not cover.

## Risks and Open Questions

Known risks, unverified assumptions, and decisions still pending.

</spec-template>
