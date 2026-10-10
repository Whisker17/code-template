# Research pages (research mode)

A research page turns the result of one piece of research into a one-page **explainer**. The readers are developers who did not do the research and do not know the field. After reading, they must be able to understand the conclusions, check them, and keep working from them. Karpathy says our work is "moving up to supervision and understanding"; a research page is the artifact for that. It is single-use: made for this one piece of research, not a general framework.

Full example: [`examples/kv-cache.research.md`](../examples/kv-cache.research.md) (in Chinese; it uses every component in this file). Skim it before you start.

## Contents

1. Workflow (8 steps, each with a done criterion)
2. Page skeleton (a draft you can copy)
3. Context and Background
4. The prerequisite ladder and cards
5. Glossary, the running example, reading paths
6. Adapting the skeleton to the kind of research
7. Checklist

## 1. Workflow

### 1.1 Gather the material

Collect everything the research produced: notes, code paths, commands and their output, benchmark data, papers, earlier conversations. This mode only **explains** research. If the research is not finished, finish it first.

In a scratch area (not on the page), keep a **claim ledger**: claim → evidence (`file:line`, command output, URL) → kind (observed / inferred / speculative).

**Done when:** every claim that will appear on the page has a row in the ledger. Delete a claim with no evidence, or mark it speculative.

### 1.2 Set the reader and the gap

The default reader is "a capable developer who is new to this field". Ask the user only when the reader is unclear and the answer changes the depth (a newcomer vs a domain expert).

First write the "you already know" list, the reader baseline (see §3). Then build the prerequisite ladder and write the glossary (see §4, §5).

**Done when:** every technical word in "How it works" and "Findings" is one of three things: on the baseline list, covered by a prereq card, or in the glossary.

### 1.3 Plan the page

Start from the skeleton in §2 and pick the variant for this kind of research in §6. For each main point, write down the **question** its figure answers, then choose the kind of figure and the tool (Excalidraw sketch / UML blueprint) with [diagrams.md](diagrams.md).

**Done when:** the plan lists every panel with its depth (overview panels use sheet), and every figure with its question, kind and tool. With more than 8 figures, show the plan to the user first.

### 1.4 Draw the figures

Write sketches as `excalidraw` and blueprints as `uml`; see [diagrams.md](diagrams.md). Every figure has `q=` and `takeaway=`, plus `read=` when it helps.

### 1.5 Write the text to STE-80

Write all text by [writing.md](writing.md). Use the user's language; keep code identifiers in English and in backticks.

### 1.6 Render and bake

Save the draft as a file, so it can be reviewed and rendered again. Put the page next to the draft:

```bash
AM="node ${CLAUDE_SKILL_DIR}/scripts/am.mjs"
mkdir -p docs/explainers                              # or where the user / the repository keeps them
# after writing docs/explainers/2026-10-03-kv-cache.md:
$AM render docs/explainers/2026-10-03-kv-cache.md -o docs/explainers/2026-10-03-kv-cache.html
```

The render checks:
- component syntax and the Excalidraw spec (unknown nodes, overlaps, labels that do not fit)
- `[[terms]]` that are not defined
- STE writing
- research-page completeness (a missing `q=`, a missing prereq / finding / glossary / overview)

Then it bakes the figures into the page with the local Chrome. On `✗ L<line>`, fix that line and render again with `--replace <page>`.

### 1.7 Look at the screenshots (until they are clean)

```bash
$AM shot docs/explainers/2026-10-03-kv-cache.html     # → $TMPDIR/am-shots/<page name>/*.png (the path is printed)
```

Open and **look at each one**: `overview.png`, every `fig-N.png`, every `panel-X.png`. Automatic checks cannot see layout problems. Fix the draft by the checklist in §7, then render again.

When the page will be read on a phone (for example, published to doc-hub), also run `$AM shot <page> --width 390`. The printed "body width" must be close to the viewport width, and there must be no "Horizontal overflow" warning.

**Done when:** the render prints `STE ✓`, or only warnings you keep for a reason, and `Baked ✓`; and you have looked at every screenshot after the last change.

### 1.8 Hand over

- Open the page and tell the user:
  - the paths of the page and the draft
  - the three reading paths
  - one line per figure
  - what you deleted or marked speculative
  - the open questions
- The screenshots stay in the system temp directory. They are for review only and do not go into the repository.

## 2. Page skeleton

Copy it and replace the content. Panel letters may change, but must not repeat on one page.

````markdown
---
template: research
title: <the subject, not "A study of X">
subtitle: <one STE sentence: the main conclusion>
cols: 4
type: Technical research      # every key below shows in the page header
audience: <the reader, for example: backend developers new to X>
scope: <the scope>
evidence: <the evidence, for example: 3 experiments, code @abc123>
date: <YYYY-MM-DD> · v1
---
<Lead: the conclusion in 1–2 sentences, linking [F1](#F1).>

## A <parts / structure> {sheet meta="…"}          ← 4–6 overview panels, each in a different form
## B <key formula / command / config> {sheet span=2}  ← annot
## C <options compared> {sheet}                    ← ✓/✗ table
## D <key numbers> {sheet span=2}                  ← table / limits
## E <evolution> {sheet span=2}                    ← timeline
## F Conclusion {sheet span=4}                     ← callout ok: the conclusion + where to start reading

## G How to read this {depth=1}       ← callout info "You already know" + which panels each kind of reader reads
## H Context {depth=2}                ← the problem / why now / scope and non-goals / existing approaches / constraints
## I Background {depth=2}             ← excalidraw prerequisite map + prereq cards (in ladder order)
## J How it works {depth=2}           ← excalidraw sketch first, then uml blueprint
## K Findings {depth=2}               ← finding F1… in order of importance
## L Method and evidence {depth=3}    ← setup, result tables, deep details
## M What it means for us {depth=2}   ← numbered actions; callout warn / err when the cost is high
## N Limits and open questions {depth=2}
## O Reproduce {depth=3}              ← environment, exact commands, expected output
## P Glossary {depth=2}               ← glossary
## Q References {depth=2}             ← numbered list; mark primary sources **PRIMARY**; say "why read it" for each
````

## 3. Context and Background

They answer different questions. Write them apart.

| Panel | Answers | Content |
|---|---|---|
| **Context** | **Why** does this research exist? | The problem (one concrete symptom, with a number if possible), why now, scope and non-goals (a list), existing approaches and their gaps (with sources), constraints |
| **Background** | What must the reader **know first** to follow it? | The prerequisite map, prereq cards, the running example |

Context makes the reader want to read; Background makes the reader able to. Without either one, onboarding fails.

The **"you already know" list** is a contract: what is on it is not explained, and what is not on it must be explained or linked. Write 3–8 items, as concrete as possible: "A GPU has its own memory, of limited size" is better than "GPU basics". When the user names the reader ("the iOS team", "new ML engineers"), adjust the baseline and put the reader in the header's `audience`.

## 4. The prerequisite ladder and cards

1. **Collect terms**: list every concept that "How it works" and "Findings" use (nouns, techniques, metrics, system parts).
2. **Remove the baseline**: strike out the concepts on the "you already know" list.
3. **Find dependencies**: for each concept left, ask "which concepts on this list must I know to understand it?" The result is a directed acyclic graph (DAG).
4. **Grade them**:
   - **L1 (must know)**: without it the findings make no sense. Write a full card, with `l1`.
   - **L2 (helps)**: write a short card: only what / why / deeper.
   - **Term only**: a glossary entry is enough.
5. **Order and number**: number the cards in topological order, `B-0`, `B-1`…, and use the same numbers on the map nodes.
6. **Draw the map** with `excalidraw`. Draw "you already know" as gray dashed boxes, cards as blue boxes, the subject as a green box. An arrow means "learn first → learn after"; when the reason is not obvious, write it on the arrow.

Card fields (`prereq`; the Chinese key names `是什么` / `为什么需要` / `例子` / `误解` / `深入` / `依赖` are accepted too):

| Field | Rule |
|---|---|
| `# title` | the name, plus the English name when the page is not in English |
| `what:` | 1–3 STE sentences. Define it by what it **does**, not "it is about…" |
| `why:` | 1–2 sentences that connect the concept to **this** research. This field turns a textbook card into an onboarding card; it is required |
| `example:` | the smallest concrete instance: 3–6 lines of code, a computed set of numbers, a formula with real values |
| `misconception:` | one "Myth: … Fact: …" pair, about a mistake newcomers really make |
| `deeper:` | exactly one best primary source, with a section number if possible |
| `needs:` | optional, for example `B-0` |

Keep each card body to about 120 words (about 120 Chinese characters), the example not counted. If it does not fit, split it into two cards.

How many: a small gap (a neighbouring field) needs 1–2 L1 cards and 5–10 glossary entries; a medium gap 3–5 L1 cards and 10–20 entries; a large gap 5–8 L1 cards, a layered map and 20+ entries. More than 8 L1 cards means the subject is too big: split it into a series, or ask the user to narrow the scope.

## 5. Glossary, the running example, reading paths

**Glossary**:
- Each line is `term | alias | definition | often confused with`. Write the definition in 1–2 STE sentences. In the last column, write the most typical confusion, for example "not an HTTP cache".
- Keep reading order, not alphabetical order. A newcomer reads from the top.
- In each main panel, write the first use of a term as `[[term]]` (or `[[shown text|term]]`), so the reader sees the definition on hover. A term that is not defined is an error.

**The running example**: at the start of Background pick **one** concrete example (one request, one model, one record, one commit), and work it through every panel. State each number once, for example in an overview panel. A finding first gives the result on this example, then the general case.

**Reading paths**:

| Path | Shows | Reader | Can then |
|---|---|---|---|
| 5 minutes | sheet overview + depth=1 | a lead / a reviewer | know the conclusion and the magnitudes, and decide whether to read on |
| 30 minutes | + depth=2 | a developer who will use the result | explain the conclusion and act on it |
| Everything | + depth=3 | a developer who will extend or re-check the research | reproduce it and challenge it |

## 6. Adapting the skeleton to the kind of research

| Kind of research | Change | Common figures |
|---|---|---|
| How X works | How it works is the core; findings are the non-obvious properties | sketch for intuition → UML sequence / state → UML class / component |
| Codebase deep dive | Start How it works with a "code map" table (`path` → responsibility → entry point, linked at a fixed commit); findings are hot spots, risks and seams | UML component / class, a sequence of one real request; an Excalidraw module map |
| Experiment / benchmark | Put Method and evidence before Findings (depth=2); add "Hypothesis" to Context; Reproduce is required | a sketch of the setup, result tables, limits, before / after |
| Comparison / evaluation (A vs B) | Add "Decision criteria" to Context, before any result; one finding per criterion; "What it means for us" gives a recommendation | a ✓/✗ table in the overview, two sketches before / after, blueprints side by side |
| Paper / literature | Write existing approaches as a lineage (timeline + a "what each paper changed" table); add "what the paper does not prove" to Limits | timeline, a sketch of the core idea, UML activity for the algorithm |
| Incident / debugging | Context gives the impact and the timeline; How it works is the causal chain; findings are the root cause and contributing factors | a sequence of the failure, state, timeline, an Excalidraw cause map |

## 7. Checklist

**Look at the screenshots:**
- [ ] The overview is about one screen (≤ ~950 px high at 1440 wide), each panel in a different form, no paragraph longer than 2 sentences.
- [ ] Every figure: no overlapping nodes, no labels on lines, readable text. The emphasis is on what `q` asks. Sketches look like sketches, blueprints like blueprints.
- [ ] No walls of text: 5 or more paragraphs in a row become a figure, a list, or move down to depth=3.
- [ ] Phone (`--width 390`): the body is nearly full width, no horizontal overflow, figures scroll sideways and their text is readable.

**Read it once as a newcomer:**
- [ ] Cold start: with only the baseline, can you read from Background → How it works → Findings without opening a link?
- [ ] Switch to "5 minutes": do the overview and the lead give the conclusion and the magnitudes?
- [ ] Every number in the overview and the lead appears again in Findings or Evidence, with its source.
- [ ] The Reproduce commands can be copied and run as they are, and state the expected output.
- [ ] Limits has at least one real threat to validity.
- [ ] The title names the subject; the subtitle states the conclusion.
