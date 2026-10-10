# Where the method comes from

## Karpathy's post

Source: Andrej Karpathy, X, 2026-10-02 — <https://x.com/karpathy/status/2105819303471976479>

The post opens with: "We'll be spending a lot more time trying to understand the outputs of language models." It then gives a ladder of output formats, each one "even better" than the one before:

| Step | Karpathy's words | What this skill does |
|---|---|---|
| Writing | Ask the LLM to write in ASD-STE100 (the controlled language of aircraft maintenance documents), or in "80% STE" | Every render runs the STE check (upstream), for English and Chinese; the research-page rules are in [writing.md](writing.md) |
| Diagrams | "Instead of writing, ask your LLM to create a diagram." | Upstream's flow / er / sequence / tree / timeline components; this fork adds Excalidraw sketches and UML blueprints, see [diagrams.md](diagrams.md) |
| Web pages | Ask the LLM for output "in HTML" and get a good-looking, interactive page | A single-file page with no dependencies, with themes, dark mode, Copy source, Reply and Remark; the research template adds reading paths and term hovers |
| Video | A 3b1b-style explainer video | Not part of this fork's workflow (upstream has `am video`) |

The post draws two conclusions:
- Our work moves "up to supervision and understanding". So a research page must let people **check** its conclusions: finding cards mark the kind of evidence, and the page has Reproduce.
- Intelligence and code are now plentiful, so it is fine to ask for "large, bespoke, single-use software artifacts". So every page is made for one piece of research.

## The post's picture: an engineering-drawing overview

The picture explains all of ASD-STE100 on one drawing sheet. Upstream's `sheet` template and `blueprint` theme follow it:
- a frame with 1–8 / A–D coordinate ticks
- letter-numbered panels (a black letter tag + a title + small monospace text top right)
- one form per panel: a tree, word-by-word notes, a ✓/✗ status table, limit bars, a timeline, a title block
- nearly monochrome, with only blue and red as accent colours

The research template puts this sheet at the top of the page as the 5-minute overview (the `{sheet}` panels).

## Upstream and this fork

**Upstream**: [QingYunA/answer-me-with-html](https://github.com/QingYunA/answer-me-with-html). The core idea: the model writes only a content draft, and the CLI does the layout and the drawing. Hand-writing HTML makes the model output CSS and SVG coordinates line by line, about 7000 output tokens; a draft takes about 900.

**This fork adds to upstream:**
1. `excalidraw` / `uml` components. The browser draws them, and `am bake` bakes them back into a single file with no dependencies with the local Chrome; `am shot` screenshots each figure for review.
2. The `research` template: overview sheet, body, contents, reading paths.
3. The `prereq` / `finding` / `glossary` components, and `[[term]]` hover links.
4. Research-page completeness lint and a longer empty-word list.
5. The working method for research pages ([research.md](research.md)): the claim ledger, the reader baseline, the prerequisite ladder, Context apart from Background, evidence kinds, the screenshot review.
