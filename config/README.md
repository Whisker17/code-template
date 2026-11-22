# config/

Non-secret runtime parameters — thresholds, feature flags, tunables — live here as YAML,
loaded into a typed, validated model at startup.

## The convention

- **Secrets** go in `.env` (never committed; `.env.example` is the template). They are
  credentials — API keys, private keys, webhook URLs.
- **Parameters** go here, in YAML, checked in. They are decisions — every value should
  trace to `docs/DESIGN.md` §2 or be flagged as unvalidated.
- Loading is **typed and fail-fast**: define a pydantic model per config file, parse at
  startup, and include cross-field validation (e.g. `min_x < max_x`). A bad config must
  kill the process with a clear error before any real work starts.
- Per-deployment overrides use an untracked `<name>.local.yaml` copy (gitignored), so
  checking out a release tag never conflicts with live settings.

No loader code ships with the template — write it when the first config file lands.

## Role bindings

`agent-roles.conf` is not YAML: it is a shell-sourced `KEY="value"` file that
`scripts/agent-dispatch.sh` reads from the **primary clone**. The optional
`content-roles.conf` (`DECK_WRITER`, `DECK_REVIEWER`; delete it if unused) has the same shape
and is read by `scripts/roles.sh`, which also lists, checks and (`set`) changes both files.
Their values change through the owner's value-only commit straight to the trunk
(`docs/GIT_WORKFLOW.md` § Role binding lane), which `.githooks/pre-push` checks; adding or
removing a role, or touching a comment or format, is a governance PR. Contract and defaults:
`docs/agents/runtime.md`.
