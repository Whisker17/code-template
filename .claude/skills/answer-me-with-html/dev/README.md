# answer-me-with-html (research fork): development notes

This directory is the source of the skill. At run time the skill needs only the parent directory's `SKILL.md`, `references/`, `examples/` and `scripts/am.mjs` (the bundle).

- Upstream: <https://github.com/QingYunA/answer-me-with-html>, MIT (see `LICENSE`).
- Fork version `X.Y.Z-research.N`: based on upstream `X.Y.Z`. Current base: **upstream v0.5.0** (`b275eba`, synced at `533c39f`).
- `dev/` mirrors the upstream repository root for `src/`, `test/`, `bin/`, `scripts/build.mjs`, `scripts/inline-assets.mjs`, `package.json` and `examples/` (`dev/examples/` is used by the tests only; the agent-facing examples are in `../examples/`). Upstream's `skills/answer-me-with-html/` is the parent directory.
- Not carried over: the plugin manifests and commands, the website (`site/`), bench, docs and demo, and the release / snapshot / smoke-install scripts.
- Upstream's `am video` code stays in `src/` (it is wired into themes, languages, page and patch), but `SKILL.md` does not document it and `references/video.md` is not shipped.

## Build and test

```bash
cd .claude/skills/answer-me-with-html/dev
npm install                 # esbuild + marked + dagre + yaml, only for development
npm test                    # unit tests; the real bake / layout tests need: AM_TEST_BAKE=1 npm test
npm run build               # after changing src/, regenerates ../scripts/am.mjs (commit it)
```

`node_modules/` is ignored. `../scripts/am.mjs` is a committed build output: when `src/` changes without a build, the bundle test fails (version check). On a merge conflict in `am.mjs`, take either side and rebuild; never merge it by hand.

## Changes from upstream

| File | Change |
|---|---|
| `src/components/excalidraw.js` | New component: an Excalidraw JSON spec. Checks node ids, overlaps and label room statically; errors carry line numbers |
| `src/components/uml.js` | New component: Mermaid source (alias `mermaid`); checks the diagram type, refuses C4 |
| `src/components/figure.js` | Figure shell: number, `q` / `read` / `takeaway` |
| `src/components/research.js` | New components: `prereq`, `finding`, `glossary` (English keys; the Chinese keys of the first fork version are accepted) |
| `src/components/index.js` | Registers the new components; `ALIASES` / `resolveComponent`; `LIVE` (components the browser draws) |
| `src/languages/research.js` | Labels of the research template and components per language (zh, zh-Hant, en, ja, he; English fallback), kept out of the upstream language files |
| `src/markdown.js` | `[[term]]` links (not inside code); an undefined term is an error |
| `src/render.js` | Fence aliases become component names; glossary collected first; figures numbered; `data-am-live="pending"` and the diagram runtime when a page has figures; returns `live` |
| `src/templates/research.js` | New template: `{sheet}` overview (sized like the sheet template), body, contents, reading paths by `depth=1/2/3` |
| `src/templates/panel.js` | `depth` option (`data-depth`); `bake` is a reserved frontmatter key |
| `src/page.js` | `readPage` recognizes the research template, so `am patch` keeps it |
| `src/parse.js` | `research` is a template choice |
| `src/runtime/diagrams.js` | Browser runtime that loads Mermaid / Excalidraw from a CDN; inlined only when a page has figures that are not baked |
| `src/runtime/page.js` | Reading-path buttons; the `.excalidraw` download button of a baked figure |
| `src/bake.js` | Drives the local Chrome over the DevTools protocol (Node's built-in WebSocket): `bakeFile` / `shotFile`. Baking copies only the drawn `<figure>` elements back into the file (`spliceFigures`) |
| `src/cli.js` | render and patch bake after writing; new `am bake`, `am shot` (`--only`, `--width`, reports body width and horizontal overflow), `--no-bake`; a figure error keeps the page closed like an STE warning; help takes aliases |
| `src/config.js` | New key `bake` (on / off); `AM_NO_BAKE=1` also skips baking |
| `src/update.js` | A fork version compares upstream against its base and never suggests `npx skills update` (it would replace the fork) |
| `src/lint/*` | Research-page completeness; prereq / finding checked field by field; longer English / Chinese empty-word lists |
| `src/themes/base.css` | Styles of the new components and the research template; baked SVGs inverted in dark mode; at 760px a one-column research page and an absolute toolbar |
| `src/assets.js`, `scripts/inline-assets.mjs` | `DIAGRAM_JS` |
| `scripts/build.mjs` | Writes `../scripts/am.mjs` |
| `test/research.test.js` | Tests of the fork. `bundle`, `install`, `frontmatter`, `language` and `robustness` tests point at the fork layout; `site` and `always-rule` tests are removed |

## Why baking uses Chrome

Mermaid and Excalidraw need a real DOM and real font metrics, so Node cannot draw them. The page is made in three steps:

1. render writes a page with a CDN runtime; the page shows the figures when it is online.
2. `am bake` opens it in headless Chrome and waits until the runtime sets `data-am-live` to `ok`.
3. It takes each drawn `<figure>` from the browser, puts it in place of the placeholder in the file, and removes the runtime. Nothing else comes from the browser, so the load-time changes of the page script (layout styles, toolbar state, diagram buttons) do not end up in the file. The baked page loads nothing from outside; Excalidraw fonts are embedded as base64.

An Excalidraw trap: before the hand-drawn font loads, the canvas measures text too narrow, so labels are cut and edge masks are too small. `diagrams.js` exports once first, registers the fonts embedded in that SVG with `document.fonts`, then converts for real.

## Always-on mode

Upstream replaced its always-on plugin with a rule in a rules file. To turn it on for a project, add this line to its `AGENTS.md` / `CLAUDE.md` (SKILL.md recognizes the marker):

> [answer-me-with-html always-on] Whenever a reply gives a conclusion, summary, plan, comparison, review or explanation, even a short one, also make a page with the answer-me-with-html skill (2 to 4 panels for routine answers), render it with --no-open before you write the reply, and end the reply with a file:// link to the page. Skip casual chat, one- or two-sentence replies with no conclusion, pure command output, and requests for plain text.

## Syncing with upstream

Do a three-way merge in an upstream clone, then copy the result back. The fork base is the upstream commit named at the top of this file.

```bash
git clone https://github.com/QingYunA/answer-me-with-html /tmp/am-up && cd /tmp/am-up
git checkout -b fork <base commit>
# Put the fork into the upstream layout: dev/{src,test,bin,scripts,package.json,examples} → ./,
# ../{SKILL.md,references,agents,scripts/am.mjs} → skills/answer-me-with-html/. Commit.
git merge main             # resolve conflicts, keeping every change in the table above
```

Then copy `src/`, `test/`, `bin/`, the two scripts and `package.json` back into `dev/`, take upstream's new `SKILL.md` text into `../SKILL.md` (keep the fork sections), run `npm install && npm run build && npm test` (and `AM_TEST_BAKE=1 npm test` with Chrome), bump the version to `<upstream>-research.1`, and update the base commit above and the project `CHANGELOG.md`.
