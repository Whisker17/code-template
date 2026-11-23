# Matt Pocock skills: upstream sync

Reviewed upstream: [`mattpocock/skills` at
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d).
Tracking issue: WHI-2275. These are locally maintained adaptations, not byte-for-byte copies.

`skills-lock.json` remains the historical installer baseline and is **not** the current
sync revision or a checksum of the customized files. Use this record for manual upgrades;
do not run a bulk re-install over these skills. Compare each upstream skill and its
supporting files, follow aliases, merge compatible changes, and update this revision.

| Local skill | Upstream path (relative to `skills/`) | Synced behaviour | Retained template contract |
| --- | --- | --- | --- |
| `grill-me` | `productivity/grill-me/`, plus `productivity/grilling/` | Dependency-aware frontier rounds, recommendations that "yes" accepts, fresh-context fact lookup when authorized, user confirmation before action | Self-contained skill, environment facts looked up directly when delegation is unavailable, no repeated settled decisions; no separate `grilling` install |
| `handoff` | `productivity/handoff/` | Portable temp-directory order, suggested skills, argument-focused handoffs, references instead of duplication, redaction | Durable PR/Linear evidence, fixed field list, caller-bound output paths, absolute saved path, next-session prompt |
| `implement` | `engineering/implement/` | Fetch a passed ticket and state its title; resolve ambiguous references before starting | One issue/worktree/PR, E2E-first instead of upstream TDD, lane-specific checks and merge authority, independent Quick review, cleanup |
| `to-spec` | `engineering/to-spec/` | Repo exploration, domain glossary and ADRs, highest existing test seam, external behaviour, decision-rich prototype snippets | Stable numbered `docs/DESIGN.md`, testing decisions agreed before synthesis, bounded design review before writing, publishing only on instruction; no automatic ready-for-agent issue |
| `to-tickets` | `engineering/to-tickets/` | Glossary/ADR context, vertical slices and expand–contract, native parent sub-issues with confirmed parent links | Canonical issue template, complexity/scope, design review, single-writer relations-last publishing, query before retry, Linear only; no local tracker fallback |
| `code-review` | `engineering/code-review/` | Standards-source discovery, separate Standards and Spec assessments, spec lookup, Fowler smell baseline with repo precedence, fresh-context reviewers | Quick/Standard/Deep modes, six angles, independent verification and stable finding ids, artifact gates and bounded rounds; no unverified reports presented as defects |

Upstream's generic skill-tool wording is adapted to the runtime-neutral invocation contract
in `AGENTS.md`. Review calls may run concurrently within runtime limits and must finish
before verification; upstream's two foreground agents do not replace the template's
hunter/verifier procedure. Smells are suggestions, never automatic refactoring mandates.

All six `agents/openai.yaml` files were compared. Four already match upstream. `implement`
and `code-review` retain their local short descriptions because they describe the template's
issue workflow and release-review modes more accurately. No other supporting files exist
in those six upstream directories; `grilling` is folded into `grill-me` above.

Other upstream skills, including `implement-spec`, are not imported. The template's
first-party `orchestrate` already owns release scheduling and integration; its worktree,
review and promotion gates stay authoritative.
