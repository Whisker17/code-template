# Agent runtime adapter

How this repo's skills reach another agent without assuming a runtime or vendor.

Skills name a **role** and a semantic **effort**; this file and one config file map them
to real commands. Model generations turn over every few months, so the mapping has exactly
one edit point.

- **Mapping (the only place a model ID lives):** `config/agent-roles.conf`
- **Executable seam:** `scripts/agent-dispatch.sh`
- **Tests (fake runtimes, no model calls):** `tests/test_agent_dispatch.py`

## Roles

| Role | Does | Effort | Does not |
| --- | --- | --- | --- |
| `ORCHESTRATOR` | Reads the whole release, dispatches work, verifies evidence, merges serially, runs the release review loop (`/orchestrate`) | `high` | Implement features; declare a review passed |
| `IMPLEMENTER` | Implements one issue in its own worktree, runs the relevant checks, opens the PR, hands off (`/implement`) | `medium` / `high` from the issue's `Complexity` (`docs/agents/issue-template.md` § Execution) | Widen scope; create the next release |
| `REVIEWER` | Independent adversarial review of a PR range or a release snapshot (`/code-review`): each bug hunter and the verifier is its own fresh dispatch | `high` | Edit the reviewed code; pass style preferences off as defects; verify its own findings |
| `REVIEWER_FALLBACK` (optional) | The same review step (one hunter or the verifier), only after a real `REVIEWER` call failed (§ Reviewer unavailable) | `high` | Run unless the primary was actually invoked and failed; run for a validation failure |

Ordinary exploration is done by whichever role owns the task. There is no escalation role:
unresolved findings past the review budget go to a human.

## The invariant

> Review runs in a **different context** from the one that wrote the code, preferably on a
> **different vendor**.

A self-review inside the implementing context never counts as the independent review any
rule asks for. There is no reliable automatic ranking of "at least as capable"; choose the
reviewer deliberately (below) and record which model reviewed.

## Dispatch

```text
scripts/agent-dispatch.sh <ROLE> <prompt-file|-> --effort <medium|high>
scripts/agent-dispatch.sh --probe [ROLE ...]
```

- `--effort` is a template-level word. The dispatcher translates it through the role's
  `_EFFORT_MEDIUM` / `_EFFORT_HIGH` value into the runtime's own flag; it is never passed
  through on the assumption that two CLIs mean the same thing.
- Unknown role or effort, missing `--effort`, or a missing prompt file: exit `2`.
  Unset runtime/model, unsupported effort (mapping unset), unknown runtime, or binary not
  on `PATH`: exit `3`. Any other non-zero exit is the runtime's own (authentication and call
  failures included), returned unchanged. The dispatcher never retries, never swaps in
  another model and never lowers the effort. `REVIEWER_FALLBACK` is validated exactly like
  any other role (undeclared: exit `3`) and the dispatcher never selects it: using it is the
  caller's explicit second dispatch, allowed only by § Reviewer unavailable.
- The adapter builds the **whole** argv; there is no free-form flag or command field, so
  nothing can override the model, the effort or the fresh session (no resume/continue).
  Model and effort values must be single plain tokens. Permissions and sandboxing belong
  in the runtime's own config. A leftover `<ROLE>_CMD` / `<ROLE>_EXTRA_ARGS` fails with
  exit `3`.
- The dispatched process runs in the caller's working directory (for an implementer, its
  worktree); its result is stdout.
- No secrets in the config: authentication is the runtime's own login or environment.

**Native sub-agents** (a runtime's own fresh-context primitive) may replace the subprocess
only when they honour the same role model, effort, working directory and output contract,
read from `config/agent-roles.conf`. If the primitive cannot set the configured model and
effort, use the subprocess path — do not silently drop the effort.

**Orchestrator session.** `ORCHESTRATOR_MODEL` names the target orchestrator model. If the
current session is not running it, warn once, record the actual model and effort in the
orchestration document and continue in this session; do not start another session or hand
off. A config file cannot switch the model of a session that is already running; never claim
it did. `/orchestrate` runs unattended in that session: its implementers are native
sub-agents visible to it when they honour the role's model, effort and working directory
(above), else `scripts/agent-dispatch.sh` run where the session can watch it to completion —
never an unobserved background process.

## Preflight

- `--probe` checks the config file and `PATH` only. It is **not** evidence of
  authentication or a working call, and must never be reported as such. An undeclared
  `REVIEWER_FALLBACK` is reported `unset` and does not fail the probe; an unset primary role
  or a half-declared fallback does. It warns when the fallback shares `IMPLEMENTER`'s model.
- The real check is one light call per role that will be used:
  `printf 'Reply with exactly: DISPATCH-OK\n' | scripts/agent-dispatch.sh <ROLE> - --effort high`
  must print `DISPATCH-OK` and exit `0`. Include `REVIEWER_FALLBACK` when it is declared.
- Run it **once at the start of a release** (or before a standalone `/implement` relies on
  `REVIEWER`) — not before every issue. Run it again when the config changes or a real
  dispatch hits an authentication or call error.

## Reviewer unavailable

`REVIEWER` is unavailable when its dispatch exits non-zero. Two cases differ:

- **Validation failure — exit `2` or `3`** (unknown role or effort, unset runtime, model or
  effort mapping, unknown runtime, binary not on `PATH`, rejected value): no runtime was
  invoked. This is a configuration or usage error, **never a reason to use
  `REVIEWER_FALLBACK`**. Stop, fix the configuration, and treat the reviewer as unavailable
  (below).
- **Call failure:** the primary `REVIEWER` passed validation, the runtime was actually
  invoked and returned a non-zero exit code, empty output or a transport error.

**`REVIEWER_FALLBACK`** (optional, declared in `config/agent-roles.conf`) is eligible
**only** after a call failure of the primary. The caller — never the dispatcher — then
dispatches it, **at most once per review step** (one hunter or the verifier dispatch of
`/code-review`). Record both outcomes in the PR or the
orchestration document: `primary REVIEWER <model> failed: <error>; used REVIEWER_FALLBACK
<model>`, and the fallback's own result (a fallback that also fails is recorded the same
way). The fallback review counts as the independent review only if it ran in a fresh
context other than the implementer's; a fallback that is `IMPLEMENTER`'s model is not
independent, and `--probe` warns about it.

If no fallback is declared, or it is unset, fails validation, or fails its call: the
v0.2 behaviour below applies.

- Ordinary version issues may still be implemented and integrated into the version branch
  (their review is the release review anyway), but the **release is blocked** and must not
  be promoted.
- Paths that need an independent pre-merge review (governance, standalone `/implement`,
  hotfix) stay at **`In Review`**; say in the PR which role was unavailable.
- Never replace the missing review with a review in the implementing context, and never
  record findings in `docs/DEFERRED_ISSUES.md` from a review that did not happen.

## Parallel dispatch

Parallelism buys wall-clock time; only context isolation is load-bearing. Use the runtime's
existing concurrency limit. If you cannot confirm capacity, or the runtime cannot run
dispatches concurrently, run them **serially**, one dispatch per task. There is no separate
scheduler configuration.

## Choosing models

Cross-vendor review is the preferred configuration: independent failure modes catch more
than a stronger model sharing the implementer's blind spots. `--probe` notes when
`IMPLEMENTER` and `REVIEWER` use the same model.

The template ships these **defaults**, all on `pi`, each confirmed with a real
`DISPATCH-OK` call at the efforts it maps:

| Role | Model (pi registry ID) | Note |
| --- | --- | --- |
| `ORCHESTRATOR` | `claude/claude-opus-5-5` | `medium` and `high` mapped as themselves |
| `IMPLEMENTER` | `claude/claude-sonnet-5-5` | `medium` or `high` from the issue's `Complexity` |
| `REVIEWER` | `magpie/codex/gpt-6-astra` | A different vendor than `IMPLEMENTER` |
| `REVIEWER_FALLBACK` | none (empty) | Declare one deliberately; see § Reviewer unavailable |

A model ID is valid only on a machine whose runtime lists it, so the defaults are not
proof: `SETUP.md` step 1.9 re-verifies every role with a real call and the project keeps or
changes each one. A role that fails stays failed — no silent substitution, no lower effort.

When a generation turns over, edit `config/agent-roles.conf` and nothing else. A model name
inside `.claude/skills/` is drift; fix the skill to name a role.

## Per-runtime notes

| Runtime | Adapter argv (flags read from `--help`; confirm with one real call) | Native sub-agent | Instruction/skill loading |
| --- | --- | --- | --- |
| Claude Code | `claude -p --model <M> --effort <E>`, prompt on stdin | `Agent` tool, if it can honour model and effort | Loads `AGENTS.md` natively from **v2.1.281**; a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the tree or an ancestor can stop it loading `AGENTS.md` (user setting `claude-md-and-agents-md` changes that). Confirm with `/memory`. Skills auto-load from `.claude/skills/` as `/name`. |
| Codex | `codex exec --model <M> -c model_reasoning_effort="<E>" -`, prompt on stdin | none equivalent | Reads `AGENTS.md`; skills ship `agents/openai.yaml` metadata |
| pi | `pi -p --model <provider/id> --thinking <E> @<prompt-file>` (stdin is spooled to a temp file) | the host's own sub-agent tool, same contract | Per host configuration |
| Other | add an adapter to `scripts/agent-dispatch.sh` with a test | assume none | May have no skill loader |

**No skill loader?** A skill is a markdown file: *"read `.claude/skills/implement/SKILL.md`
and follow it."* `AGENTS.md` § Agent skills lists the paths for this reason.

`EnterWorktree` in Claude Code defaults to `origin/<default-branch>`; see the base check in
`docs/GIT_WORKFLOW.md`.
