# Settings, clean-up and updates

Read this when SKILL.md section 0 sends you here.

When the arguments for this call (shown in section 0 of SKILL.md) start with `config` (for example `/answer-me-with-html config open off`), this turn handles settings only and produces no page:

- `config`: run `am config` to show the current settings, then let the user choose. Where the agent has a choice tool such as AskUserQuestion, use it: at most 4 settings at a time, these first: `open`, `theme`, `mode`, `style`, with the current value marked in the options. Otherwise ask in plain text.
- `config <key> <value>`: run `am config set <key> <value>`.
- `config reset [key]`: run `am config reset [key]`.

When the user asks in natural language ("stop opening the browser", "use the card theme by default", "do not bake the figures"), also convert it to `am config set`. Settings: `open` (auto-open the browser), `theme`, `mode`, `style`, `bake` (bake excalidraw / uml figures with the local Chrome), `update_check` (new-version notices). Run `am config` to see all descriptions.

When the arguments start with `clean`, or the user asks to clean up pages / the cache: first run `am clean --dry-run` and tell the user how many items and how much space will be deleted. Run `am clean` only after the user agrees (add `--all` to delete all pages, `--days N` to change how many days to keep).

When the arguments start with `update`, or the user asks to update this skill: this skill is a project-level fork of upstream answer-me-with-html, kept in the project's git repository. **Do not run `npx skills update` or `claude plugin update`**: either would replace the fork and drop its additions. Updating means merging upstream changes into the fork by hand, as `dev/README.md` in this skill's directory describes ("Syncing with upstream"). Tell the user that, and start the sync only when they ask for it.
