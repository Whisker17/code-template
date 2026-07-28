# Agent runtime adapter

How this repo's skills reach a *second* agent — for review, escalation, or codebase
exploration — without assuming which runtime or vendor you are working in.

Skills in `.claude/skills/` name a **role**. This file maps roles to real commands.
That indirection is the whole point: model generations turn over every few months, and
the mapping must have exactly one edit point.

- **Mapping:** `config/agent-roles.conf`
- **Executable seam:** `scripts/agent-dispatch.sh`

## The invariant

> Review must be performed by a **different context** than the one that wrote the code,
> running a model **at least as capable** as the implementer. Vendor selection follows
> the active runtime policy.

Everything below is machinery for holding that invariant in whatever runtime you happen
to be in. `model: "opus"` hardcoded in a skill is *one encoding* of the invariant, valid
only inside Claude Code — not the invariant itself.

## Roles

| Role | Purpose | Wants |
|------|---------|-------|
| `IMPLEMENTER` | The session reading this. Never dispatched — it *is* the caller. | — |
| `REVIEWER` | Fresh-context review of a diff (`/code-review`, both axes). | ≥ implementer strength; different vendor preferred |
| `ESCALATOR` | Resolves findings the review loop could not close (`/implement` round-3 escalation). | Strongest reasoner available. May equal `REVIEWER` |
| `EXPLORER` | Read-only codebase sweeps, parallelised (`/improve-codebase-architecture`, `/wayfinder` research, design-it-twice). | Cheap and fast; depth matters less |

## Two dispatch mechanisms

**1. Subprocess.** `scripts/agent-dispatch.sh <ROLE> <prompt-file>` detects the active
runtime on every call and selects that runtime's configured non-interactive role command.
Claude Code resolves to Sonnet -> Opus; Codex resolves to Luna -> Terra; Grok resolves to
Grok -> Claude Opus. All configured paths use `xhigh` effort and preserve the same
prompt/output contract and fresh-context invariant.

**2. Native sub-agent (optimization).** A runtime with its own fresh-context primitive may
use it instead. In Codex App, use the `lazycodex-code-reviewer` agent for both review
axes; its source configuration pins Terra at `xhigh`. In Claude Code, use the native
`Agent` tool with the role's `_MODEL` from `config/agent-roles.conf`. Native dispatch is
only a faster path to the same review contract.

Do **not** write a skill with a three-way branch on runtime. Write it against the role,
note that a native primitive may substitute, and let this file hold the details.

## Choosing a reviewer

The runtime-specific reviewer policies are:

- Claude Code: implementation `sonnet`/`xhigh`; review and escalation `opus`/`xhigh`;
- Codex App: implementation `gpt-5.6-luna`/`xhigh`; review and escalation
  `gpt-5.6-terra`/`xhigh`;
- Grok: implementation `grok-4.5`/`xhigh`; review and escalation Claude `opus`/`xhigh`.

The reviewer remains a fresh context. Native agents are preferred when available;
otherwise `scripts/agent-dispatch.sh` detects the current runtime on every call and picks
the matching mapping. Grok detection uses its runtime environment when available and
otherwise walks the parent process chain for the `grok` executable. Unknown or ambiguous
runtime is a hard error, not permission to use a default vendor.

## Preflight

Before any skill relies on a dispatched role:

```bash
scripts/agent-dispatch.sh --probe            # all roles
scripts/agent-dispatch.sh --probe REVIEWER   # one role
```

Exit `0` = usable, `3` = unusable. The probe confirms the role is configured and its
binary resolves on `PATH`. It **cannot** confirm the flags are correct or that the CLI is
authenticated — verify a new `_CMD` once by hand (`--help`, then one real dispatch)
before trusting it.

## Degraded mode

**This is the load-bearing rule of this file.**

`/implement`'s authorization to self-squash-merge is *derived from* the review loop having
actually run (`docs/GIT_WORKFLOW.md` § Agent / automation constraints #4). So a
portability gap must never silently become an unreviewed merge.

If a required role probes unusable:

1. **Stop. Do not review your own work in the implementing context** and call the loop
   complete. Same-context self-review does not satisfy the invariant — it is the exact
   failure the two-context split exists to prevent.
2. Finish the implementation, open the PR, and leave the tracker at **`In Review`** for a
   human. Say plainly in the PR body which role was unavailable and that the review loop
   did not run.
3. Never record findings in `docs/DEFERRED_ISSUES.md` on the strength of a review that
   did not happen.

A missing `EXPLORER` is less severe — it degrades breadth, not the safety gate. Fall back
to searching inline and say the sweep was narrower than intended.

## When a skill wants parallel sub-agents

Several skills spawn agents in parallel — `/code-review` (2), design-it-twice (3+),
`/wayfinder` research (N). Parallelism there buys wall-clock time and, more importantly,
**context isolation**. Only the isolation is load-bearing.

If your runtime cannot run dispatches concurrently, run them **serially** — one
`agent-dispatch.sh` call per agent, each with its own prompt file. Isolation is preserved
because each subprocess starts clean. Report that you ran serially; do not silently drop
agents to compensate for the wall-clock cost, and in particular never collapse
`/code-review`'s two axes into one agent — the separation is what stops one axis from
masking the other.

## Per-runtime notes

| Runtime | Native sub-agent | Skill loading | Notes |
|---------|------------------|---------------|-------|
| Claude Code | `Agent` tool, `model:` override | `.claude/skills/` auto-loaded, `/name` | Use the role mapping for model and effort selection |
| Codex | `multi_agent_v1`/flat `spawn_agent` when exposed | reads `AGENTS.md`; each skill ships `agents/openai.yaml` interface metadata | Use `lazycodex-code-reviewer` natively; otherwise use the runtime-detecting dispatcher |
| Grok | Grok agent/subprocess | reads `AGENTS.md`; no assumption of a skill loader | Use Grok for implementation and the configured Claude Opus reviewer via the dispatcher |
| Any other | assume none | may have no skill loader — see below | Use the configured subprocess path |

**Runtimes with no skill loader.** A skill is just a markdown file. If yours does not
auto-discover `.claude/skills/`, it can still be told the path: *"read
`.claude/skills/implement/SKILL.md` and follow it."* The `## Agent skills` section of
`AGENTS.md` lists the paths for exactly this reason.

## Changing models

When a generation turns over, edit the mapping for that runtime and nothing else. If you
find yourself editing a model name inside a skill, that skill has drifted back to
hardcoding — fix the skill to name a role instead.
